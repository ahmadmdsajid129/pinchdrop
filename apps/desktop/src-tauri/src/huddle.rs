//! v2 · PinchDrop Huddle: the laptops at one table, connected in one click (no gestures).
//!
//! * **Start / find / join.** A huddle is announced on the Wi-Fi (mDNS `_pdhuddle._tcp`).
//!   Teammates see it and click Join; the host clicks Allow. Both screens show the same 4-digit
//!   code (derived from the key exchange), so nobody can slip in between.
//! * **Encrypted.** Every connection starts with an X25519 key exchange; every frame after that
//!   is sealed with ChaCha20-Poly1305 (one key per direction, counter nonces). Members prove
//!   they belong with an HMAC over the huddle key bound to that connection.
//! * **Mesh.** The host tells newcomers who is in; a newcomer connects to every member directly.
//! * **Drops.** Text / code (lands on the clipboard), files, a project's *changed files* (git;
//!   the teammate clicks Accept, clashes are shown side by side), and a running localhost app
//!   (shared through a forwarder only teammates can reach). Everything is kept on a team shelf
//!   that's wiped when you leave.
//!
//! Free for up to 4 laptops; more needs Pro on the host.

use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, SocketAddr};
use std::path::{Component, Path, PathBuf};
use std::sync::{LazyLock, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use rand::RngCore;
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, CHACHA20_POLY1305};
use ring::agreement::{agree_ephemeral, EphemeralPrivateKey, UnparsedPublicKey, X25519};
use ring::hkdf;
use serde::Serialize;
use serde_json::{json, Value};
use sha2::Sha256;
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

const SERVICE: &str = "_pdhuddle._tcp.local.";
/// The huddle server's usual port (any free port when it's taken).
const HUDDLE_PORT: u16 = 47700;
/// Windows' Mobile Hotspot always gives its own laptop this address.
const HOTSPOT_HOST_IP: &str = "192.168.137.1";
/// Join codes: no 0/O, 1/I/L, so they read and type easily.
const CODE_CHARS: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAGIC: &[u8; 4] = b"PDH1";
/// Free huddles: up to this many laptops (counting the host).
pub const FREE_MAX_LAPTOPS: usize = 4;
const CHUNK: usize = 256 * 1024;
const MAX_DROP_BYTES: u64 = 500 * 1024 * 1024;
const COLORS: [&str; 8] = [
    "#0A84FF", "#FF9F0A", "#30D158", "#BF5AF2", "#FF375F", "#64D2FF", "#FFD60A", "#5E5CE6",
];

static APP: OnceLock<AppHandle> = OnceLock::new();
static STATE: LazyLock<Mutex<Option<Huddle>>> = LazyLock::new(Default::default);
static SERVER: LazyLock<Mutex<Option<Server>>> = LazyLock::new(Default::default);
static JOIN_ANSWERS: LazyLock<Mutex<HashMap<String, oneshot::Sender<bool>>>> =
    LazyLock::new(Default::default);
static SHELF: LazyLock<Mutex<Vec<ShelfItem>>> = LazyLock::new(Default::default);
static INBOX: LazyLock<Mutex<Vec<Incoming>>> = LazyLock::new(Default::default);
static SHARES: LazyLock<Mutex<HashMap<u16, tokio::task::JoinHandle<()>>>> =
    LazyLock::new(Default::default);
/// Files being received: drop id → where they go.
static RECEIVING: LazyLock<Mutex<HashMap<String, Receiving>>> = LazyLock::new(Default::default);
/// The host's hotspot is on for the huddle (what to put back afterwards).
static HOTSPOT_HOST: LazyLock<Mutex<Option<crate::hotspot::Saved>>> =
    LazyLock::new(Default::default);
/// This laptop joined a teammate's hotspot: (hotspot name, the Wi-Fi it was on before).
/// (hotspot name, the Wi-Fi it was on before)
type JoinedWifi = Option<(String, Option<String>)>;
static JOINED_WIFI: LazyLock<Mutex<JoinedWifi>> = LazyLock::new(Default::default);

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn rand_hex(n: usize) -> String {
    let mut b = vec![0u8; n];
    rand::thread_rng().fill_bytes(&mut b);
    hex::encode(b)
}

fn new_code() -> String {
    let mut b = [0u8; 8];
    rand::thread_rng().fill_bytes(&mut b);
    b.iter()
        .map(|x| CODE_CHARS[*x as usize % CODE_CHARS.len()] as char)
        .collect()
}

/// "kx7q-49mz", "KX7Q 49MZ" → "KX7Q49MZ" (None if it isn't a code).
pub fn normalize_code(input: &str) -> Option<String> {
    let c: String = input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect();
    (c.len() == 8 && c.bytes().all(|b| CODE_CHARS.contains(&b))).then_some(c)
}

fn b64() -> base64::engine::GeneralPurpose {
    base64::engine::general_purpose::STANDARD
}

// ---------------------------------------------------------------- state

struct Member {
    name: String,
    color: String,
    ip: String,
    port: u16,
    /// Plain JSON out to this member (sealed by its connection's writer).
    tx: Option<mpsc::UnboundedSender<Vec<u8>>>,
    /// My address as this member sees it (for shared localhost links).
    my_ip: Option<IpAddr>,
    /// This laptop opened the connection to them (it redials first after a drop-out).
    dial: bool,
    /// Which connection is current: a stale one closing must not knock out a fresh one.
    conn: u64,
    /// They're the huddle's host (lets people in, announces the huddle).
    host: bool,
}

struct Huddle {
    hid: String,
    name: String,
    key: [u8; 32],
    host: bool,
    me: String,
    my_name: String,
    my_color: String,
    port: u16,
    members: HashMap<String, Member>,
    /// The project I last shared changes from ("Get <me>'s latest").
    last_repo: Option<PathBuf>,
    /// 8-character join code (also names the hotspot fallback).
    code: String,
}

struct Server {
    task: tokio::task::JoinHandle<()>,
    mdns: Option<mdns_sd::ServiceDaemon>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberView {
    pub id: String,
    pub name: String,
    pub color: String,
    pub online: bool,
    pub host: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HuddleView {
    pub active: bool,
    pub hid: Option<String>,
    pub name: Option<String>,
    pub host: bool,
    pub me: Option<MemberView>,
    pub members: Vec<MemberView>,
    pub max_free: usize,
    /// The join code, shown as KX7Q-49MZ.
    pub code: Option<String>,
    /// This laptop is sharing its hotspot for the huddle.
    pub hotspot: bool,
    /// This laptop joined through a teammate's hotspot.
    pub on_hotspot: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundHuddle {
    pub hid: String,
    pub code: String,
    pub name: String,
    pub host_name: String,
    pub count: usize,
    pub ip: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfItem {
    pub id: String,
    pub from: String,
    pub from_name: String,
    pub to_all: bool,
    /// text | files | changes | url
    pub kind: String,
    pub summary: String,
    pub text: Option<String>,
    pub path: Option<String>,
    pub url: Option<String>,
    pub at: u64,
    pub mine: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeFile {
    pub path: String,
    /// "M" changed / added, "D" deleted
    pub status: String,
    pub size: u64,
}

/// A teammate's project changes, waiting for Accept.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Incoming {
    pub id: String,
    pub from: String,
    pub from_name: String,
    pub repo: String,
    pub files: Vec<ChangeFile>,
    pub ready: bool,
    pub at: u64,
    /// Where it will be applied (remembered per project), if known.
    pub target: Option<String>,
    #[serde(skip)]
    pub dir: PathBuf,
}

struct Receiving {
    kind: String,
    base: PathBuf,
    files: Vec<(PathBuf, u64)>,
    from: String,
    label: String,
    to_all: bool,
}

fn app() -> Option<&'static AppHandle> {
    APP.get()
}

pub fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

fn member_view(id: &str, m: &Member) -> MemberView {
    MemberView {
        id: id.into(),
        name: m.name.clone(),
        color: m.color.clone(),
        online: m.tx.is_some(),
        host: m.host,
    }
}

pub fn view() -> HuddleView {
    let g = STATE.lock().ok();
    match g.as_ref().and_then(|g| g.as_ref()) {
        Some(h) => {
            let mut members: Vec<MemberView> =
                h.members.iter().map(|(id, m)| member_view(id, m)).collect();
            members.sort_by_key(|a| a.name.to_lowercase());
            HuddleView {
                active: true,
                hid: Some(h.hid.clone()),
                name: Some(h.name.clone()),
                host: h.host,
                me: Some(MemberView {
                    id: h.me.clone(),
                    name: h.my_name.clone(),
                    color: h.my_color.clone(),
                    online: true,
                    host: h.host,
                }),
                members,
                max_free: FREE_MAX_LAPTOPS,
                code: Some(h.code.clone()).filter(|c| !c.is_empty()),
                hotspot: HOTSPOT_HOST.lock().map(|x| x.is_some()).unwrap_or(false),
                on_hotspot: JOINED_WIFI.lock().map(|x| x.is_some()).unwrap_or(false),
            }
        }
        None => HuddleView {
            active: false,
            hid: None,
            name: None,
            host: false,
            me: None,
            members: vec![],
            code: None,
            hotspot: false,
            on_hotspot: false,
            max_free: FREE_MAX_LAPTOPS,
        },
    }
}

fn emit_view() {
    if let Some(a) = app() {
        let _ = a.emit("huddle-changed", view());
    }
}

fn emit_shelf() {
    if let Some(a) = app() {
        let _ = a.emit("huddle-shelf", shelf());
    }
}

fn emit_inbox() {
    if let Some(a) = app() {
        let _ = a.emit("huddle-inbox", inbox());
    }
}

pub fn shelf() -> Vec<ShelfItem> {
    SHELF.lock().map(|s| s.clone()).unwrap_or_default()
}

pub fn inbox() -> Vec<Incoming> {
    INBOX.lock().map(|s| s.clone()).unwrap_or_default()
}

fn shelf_add(item: ShelfItem) {
    if let Ok(mut s) = SHELF.lock() {
        s.insert(0, item);
        s.truncate(100);
    }
    emit_shelf();
}

fn my_name(app: &AppHandle) -> String {
    crate::current_pc_name(app)
}

// ---------------------------------------------------------------- the sealed channel

struct Keys {
    send: LessSafeKey,
    recv: LessSafeKey,
    /// 4-digit check code both screens show while joining.
    code: String,
    /// Binds member proofs to this connection.
    bind: [u8; 32],
}

struct Len(usize);
impl hkdf::KeyType for Len {
    fn len(&self) -> usize {
        self.0
    }
}

fn derive(shared: &[u8], we_are_client: bool) -> Option<Keys> {
    let prk = hkdf::Salt::new(hkdf::HKDF_SHA256, b"pinchdrop-huddle-v1").extract(shared);
    let key = |info: &[u8]| -> Option<LessSafeKey> {
        let parts = [info];
        let okm = prk.expand(&parts, &CHACHA20_POLY1305).ok()?;
        Some(LessSafeKey::new(UnboundKey::from(okm)))
    };
    let (c2s, s2c) = (key(b"c2s")?, key(b"s2c")?);
    let mut bind = [0u8; 32];
    prk.expand(&[b"bind"], Len(32)).ok()?.fill(&mut bind).ok()?;
    let n = u32::from_be_bytes([bind[0], bind[1], bind[2], bind[3]]) % 10000;
    let (send, recv) = if we_are_client {
        (c2s, s2c)
    } else {
        (s2c, c2s)
    };
    Some(Keys {
        send,
        recv,
        code: format!("{n:04}"),
        bind,
    })
}

fn seal(key: &LessSafeKey, counter: &mut u64, plain: &[u8]) -> Option<Vec<u8>> {
    *counter += 1;
    let mut nonce = [0u8; 12];
    nonce[4..].copy_from_slice(&counter.to_be_bytes());
    let mut buf = plain.to_vec();
    key.seal_in_place_append_tag(Nonce::assume_unique_for_key(nonce), Aad::empty(), &mut buf)
        .ok()?;
    let mut out = nonce.to_vec();
    out.extend(buf);
    Some(out)
}

fn open(key: &LessSafeKey, last: &mut u64, frame: &[u8]) -> Option<Vec<u8>> {
    if frame.len() < 12 + 16 {
        return None;
    }
    let mut nonce = [0u8; 12];
    nonce.copy_from_slice(&frame[..12]);
    let ctr = u64::from_be_bytes(nonce[4..].try_into().ok()?);
    if ctr <= *last {
        return None; // replayed or out of order
    }
    let mut buf = frame[12..].to_vec();
    let plain = key
        .open_in_place(Nonce::assume_unique_for_key(nonce), Aad::empty(), &mut buf)
        .ok()?
        .to_vec();
    *last = ctr;
    Some(plain)
}

fn proof(key: &[u8; 32], hid: &str, member: &str, bind: &[u8; 32]) -> String {
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key).expect("hmac key");
    mac.update(hid.as_bytes());
    mac.update(b"|");
    mac.update(member.as_bytes());
    mac.update(b"|");
    mac.update(bind);
    hex::encode(mac.finalize().into_bytes())
}

type Ws<S> = tokio_tungstenite::WebSocketStream<S>;

/// Key exchange: each side sends MAGIC + its X25519 public key.
async fn handshake<S>(ws: &mut Ws<S>, client: bool) -> Option<Keys>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    let rng = ring::rand::SystemRandom::new();
    let mine = EphemeralPrivateKey::generate(&X25519, &rng).ok()?;
    let public = mine.compute_public_key().ok()?;
    let mut hello = MAGIC.to_vec();
    hello.extend_from_slice(public.as_ref());
    ws.send(Message::Binary(hello)).await.ok()?;
    let theirs = loop {
        match tokio::time::timeout(Duration::from_secs(10), ws.next())
            .await
            .ok()??
        {
            Ok(Message::Binary(b)) if b.len() == 36 && &b[..4] == MAGIC => break b[4..].to_vec(),
            Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => continue,
            _ => return None,
        }
    };
    agree_ephemeral(mine, &UnparsedPublicKey::new(&X25519, theirs), |shared| {
        derive(shared, client)
    })
    .ok()?
}

/// After the handshake: a writer task (sealing what goes into `tx`) and a reader loop.
async fn run_channel<S>(
    ws: Ws<S>,
    keys: Keys,
    first_out: Option<Vec<u8>>,
    on_msg: impl Fn(Value, &mpsc::UnboundedSender<Vec<u8>>) -> bool + Send + 'static,
) -> mpsc::UnboundedSender<Vec<u8>>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (mut sink, mut stream) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
    if let Some(f) = first_out {
        let _ = tx.send(f);
    }
    let Keys { send, recv, .. } = keys;
    tokio::spawn(async move {
        let mut ctr = 0u64;
        while let Some(plain) = rx.recv().await {
            let Some(frame) = seal(&send, &mut ctr, &plain) else {
                break;
            };
            if sink.send(Message::Binary(frame)).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });
    let tx_reader = tx.clone();
    tokio::spawn(async move {
        let mut last = 0u64;
        while let Some(Ok(msg)) = stream.next().await {
            let Message::Binary(frame) = msg else {
                continue;
            };
            let Some(plain) = open(&recv, &mut last, &frame) else {
                break;
            };
            let Ok(v) = serde_json::from_slice::<Value>(&plain) else {
                continue;
            };
            if !on_msg(v, &tx_reader) {
                break;
            }
        }
        on_msg(json!({ "t": "_closed" }), &tx_reader);
    });
    tx
}

fn send_json(tx: &mpsc::UnboundedSender<Vec<u8>>, v: Value) {
    let _ = tx.send(serde_json::to_vec(&v).unwrap_or_default());
}

// ---------------------------------------------------------------- start / find / join / leave

/// Starts a huddle with this PC as host.
pub async fn start(app: AppHandle, name: Option<String>) -> Result<HuddleView, String> {
    if STATE.lock().map(|g| g.is_some()).unwrap_or(false) {
        return Ok(view());
    }
    let my = my_name(&app);
    let hname = name
        .map(|n| n.trim().chars().take(40).collect::<String>())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| format!("{my}'s huddle"));
    let port = listen().await?;
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    let h = Huddle {
        hid: rand_hex(6),
        name: hname,
        key,
        host: true,
        me: rand_hex(4),
        my_name: my,
        my_color: COLORS[0].into(),
        port,
        members: HashMap::new(),
        last_repo: None,
        code: new_code(),
    };
    advertise(&h);
    if let Ok(mut g) = STATE.lock() {
        *g = Some(h);
    }
    emit_view();
    Ok(view())
}

/// Opens this PC's huddle server on a free port.
async fn listen() -> Result<u16, String> {
    let listener = match TcpListener::bind(("0.0.0.0", HUDDLE_PORT)).await {
        Ok(l) => l,
        Err(_) => TcpListener::bind("0.0.0.0:0")
            .await
            .map_err(|e| format!("Couldn't open the huddle connection: {e}"))?,
    };
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let task = tokio::spawn(async move {
        while let Ok((tcp, addr)) = listener.accept().await {
            tokio::spawn(accept_conn(tcp, addr));
        }
    });
    if let Ok(mut s) = SERVER.lock() {
        if let Some(old) = s.take() {
            old.task.abort();
            if let Some(d) = old.mdns {
                let _ = d.shutdown();
            }
        }
        *s = Some(Server { task, mdns: None });
    }
    if let Ok(mut p) = SERVER_PORT.lock() {
        *p = Some(port);
    }
    Ok(port)
}

fn advertise(h: &Huddle) {
    let Ok(daemon) = mdns_sd::ServiceDaemon::new() else {
        return;
    };
    let mut props = HashMap::new();
    props.insert("hid".to_string(), h.hid.clone());
    props.insert("name".to_string(), h.name.clone());
    props.insert("host".to_string(), h.my_name.clone());
    props.insert("n".to_string(), (h.members.len() + 1).to_string());
    props.insert("code".to_string(), h.code.clone());
    let ips = crate::link::lan_hosts().join(",");
    let instance = format!("huddle-{}", h.hid);
    let host = format!("pdh-{}.local.", h.hid);
    if let Ok(info) =
        mdns_sd::ServiceInfo::new(SERVICE, &instance, &host, ips.as_str(), h.port, props)
    {
        let _ = daemon.register(info.enable_addr_auto());
    }
    if let Ok(mut s) = SERVER.lock() {
        if let Some(srv) = s.as_mut() {
            if let Some(old) = srv.mdns.replace(daemon) {
                let _ = old.shutdown();
            }
        }
    }
}

/// Huddles on this Wi-Fi (about 2.5 s).
pub fn find() -> Vec<FoundHuddle> {
    let mine = STATE
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|h| h.hid.clone()));
    let Ok(daemon) = mdns_sd::ServiceDaemon::new() else {
        return vec![];
    };
    let Ok(rx) = daemon.browse(SERVICE) else {
        return vec![];
    };
    let deadline = Instant::now() + Duration::from_millis(2500);
    let mut found: HashMap<String, FoundHuddle> = HashMap::new();
    while let Some(left) = deadline.checked_duration_since(Instant::now()) {
        let Ok(ev) = rx.recv_timeout(left) else { break };
        if let mdns_sd::ServiceEvent::ServiceResolved(info) = ev {
            let Some(hid) = info.get_property_val_str("hid") else {
                continue;
            };
            if Some(hid.to_string()) == mine {
                continue;
            }
            let Some(ip) = info
                .get_addresses()
                .iter()
                .find(|a| a.is_ipv4())
                .map(|a| a.to_string())
            else {
                continue;
            };
            found.insert(
                hid.to_string(),
                FoundHuddle {
                    hid: hid.to_string(),
                    code: info.get_property_val_str("code").unwrap_or("").to_string(),
                    name: info
                        .get_property_val_str("name")
                        .unwrap_or("Huddle")
                        .chars()
                        .take(40)
                        .collect(),
                    host_name: info
                        .get_property_val_str("host")
                        .unwrap_or("")
                        .chars()
                        .take(40)
                        .collect(),
                    count: info
                        .get_property_val_str("n")
                        .and_then(|n| n.parse().ok())
                        .unwrap_or(1),
                    ip,
                    port: info.get_port(),
                },
            );
        }
    }
    let _ = daemon.shutdown();
    found.into_values().collect()
}

/// Joins a huddle: asks its host, who clicks Allow. Returns once in (or refused).
pub async fn join(app: AppHandle, ip: String, port: u16) -> Result<HuddleView, String> {
    if STATE.lock().map(|g| g.is_some()).unwrap_or(false) {
        return Err("You're already in a huddle. Leave it first.".into());
    }
    let my_port = listen().await?;
    let url = format!("ws://{ip}:{port}/");
    let (mut ws, _) = tokio::time::timeout(
        Duration::from_secs(8),
        tokio_tungstenite::connect_async(&url),
    )
    .await
    .map_err(|_| "The huddle didn't answer. Are you on the same Wi-Fi?".to_string())?
    .map_err(|e| format!("Couldn't reach the huddle: {e}"))?;
    let my_ip = match ws.get_ref() {
        tokio_tungstenite::MaybeTlsStream::Plain(s) => s.local_addr().ok().map(|a| a.ip()),
        _ => None,
    };
    let keys = handshake(&mut ws, true)
        .await
        .ok_or("The huddle connection failed. Try again.")?;
    let code = keys.code.clone();
    let _ = app.emit("huddle-joining", json!({ "code": code }));
    let my = my_name(&app);
    let (done_tx, done_rx) = oneshot::channel::<Result<(), String>>();
    let done = Mutex::new(Some(done_tx));
    let host_ip = ip.clone();
    let conn = next_conn();
    // The host's member id (from the welcome); messages on this connection come from them.
    let host_id: std::sync::Arc<Mutex<Option<String>>> = Default::default();
    let host_id_r = host_id.clone();
    let tx = run_channel(
        ws,
        keys,
        Some(
            serde_json::to_vec(&json!({ "t": "join", "name": my, "port": my_port }))
                .unwrap_or_default(),
        ),
        move |v, tx| match v["t"].as_str() {
            Some("welcome") => {
                if let Ok(mut h) = host_id_r.lock() {
                    *h = v["members"].as_array().and_then(|l| {
                        l.iter()
                            .find(|m| m["host"].as_bool() == Some(true))
                            .and_then(|m| m["id"].as_str().map(String::from))
                    });
                }
                let ok = on_welcome(&v, tx, &host_ip, port, my_ip);
                if let Some(d) = done.lock().ok().and_then(|mut d| d.take()) {
                    let _ = d.send(ok);
                }
                true
            }
            Some("denied") => {
                let why = v["why"].as_str().unwrap_or("The host said no.").to_string();
                if let Some(d) = done.lock().ok().and_then(|mut d| d.take()) {
                    let _ = d.send(Err(why));
                }
                false
            }
            Some("_closed") => {
                if let Some(d) = done.lock().ok().and_then(|mut d| d.take()) {
                    let _ = d.send(Err("The huddle closed the connection.".into()));
                }
                if let Some(id) = host_id_r.lock().ok().and_then(|h| h.clone()) {
                    member_closed(&id, conn);
                }
                false
            }
            _ => {
                if let Some(from) = host_id_r.lock().ok().and_then(|h| h.clone()) {
                    on_member_msg(&from, v, tx);
                }
                true
            }
        },
    )
    .await;
    let res = tokio::time::timeout(Duration::from_secs(90), done_rx).await;
    match res {
        Ok(Ok(Ok(()))) => {
            // The connection to the host is this member's link to it.
            if let Ok(mut g) = STATE.lock() {
                if let Some(h) = g.as_mut() {
                    let hid = host_id
                        .lock()
                        .ok()
                        .and_then(|x| x.clone())
                        .unwrap_or_default();
                    if let Some(m) = h.members.get_mut(&hid) {
                        m.tx = Some(tx);
                        m.my_ip = my_ip;
                        m.dial = true;
                        m.conn = conn;
                    }
                }
            }
            emit_view();
            Ok(view())
        }
        Ok(Ok(Err(e))) => {
            stop_server();
            Err(e)
        }
        _ => {
            stop_server();
            Err("The host didn't answer in time.".into())
        }
    }
}

/// The host let us in: take the key and member list, then connect to everyone else.
fn on_welcome(
    v: &Value,
    _tx: &mpsc::UnboundedSender<Vec<u8>>,
    host_ip: &str,
    host_port: u16,
    my_ip: Option<IpAddr>,
) -> Result<(), String> {
    let key_b = b64()
        .decode(v["key"].as_str().unwrap_or(""))
        .map_err(|_| "Bad welcome")?;
    let key: [u8; 32] = key_b.try_into().map_err(|_| "Bad welcome")?;
    let app = app().ok_or("not ready")?.clone();
    let port = SERVER_PORT.lock().ok().and_then(|p| *p).unwrap_or(0);
    let mut h = Huddle {
        hid: v["hid"].as_str().unwrap_or("").into(),
        name: v["name"].as_str().unwrap_or("Huddle").into(),
        key,
        host: false,
        me: v["you"].as_str().unwrap_or("").into(),
        my_name: my_name(&app),
        my_color: v["color"].as_str().unwrap_or(COLORS[1]).into(),
        port,
        members: HashMap::new(),
        last_repo: None,
        code: v["code"].as_str().unwrap_or("").chars().take(8).collect(),
    };
    let mut others = Vec::new();
    for m in v["members"].as_array().cloned().unwrap_or_default() {
        let id = m["id"].as_str().unwrap_or("").to_string();
        if id.is_empty() || id == h.me {
            continue;
        }
        let is_host = m["host"].as_bool().unwrap_or(false);
        let ip = if is_host {
            host_ip.to_string()
        } else {
            m["ip"].as_str().unwrap_or("").to_string()
        };
        let port = if is_host {
            host_port
        } else {
            m["port"].as_u64().unwrap_or(0) as u16
        };
        if !is_host {
            others.push((id.clone(), ip.clone(), port));
        }
        h.members.insert(
            id,
            Member {
                name: m["name"].as_str().unwrap_or("Teammate").into(),
                color: m["color"].as_str().unwrap_or(COLORS[2]).into(),
                ip,
                port,
                tx: None,
                my_ip: if is_host { my_ip } else { None },
                // A newcomer dials everyone already in.
                dial: true,
                conn: 0,
                host: is_host,
            },
        );
    }
    if let Ok(mut g) = STATE.lock() {
        *g = Some(h);
    }
    for (id, ip, port) in others {
        tokio::spawn(async move {
            dial_member(id, ip, port).await;
        });
    }
    emit_view();
    Ok(())
}

static SERVER_PORT: LazyLock<Mutex<Option<u16>>> = LazyLock::new(Default::default);
static CONN_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

fn next_conn() -> u64 {
    CONN_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
}

/// Connects to a member and proves we belong. True when connected.
async fn dial_member(id: String, ip: String, port: u16) -> bool {
    let url = format!("ws://{ip}:{port}/");
    let Ok(Ok((mut ws, _))) = tokio::time::timeout(
        Duration::from_secs(8),
        tokio_tungstenite::connect_async(&url),
    )
    .await
    else {
        return false;
    };
    let my_ip = match ws.get_ref() {
        tokio_tungstenite::MaybeTlsStream::Plain(s) => s.local_addr().ok().map(|a| a.ip()),
        _ => None,
    };
    let Some(keys) = handshake(&mut ws, true).await else {
        return false;
    };
    let Some((hid, me, key, name, color, my_port)) = STATE.lock().ok().and_then(|g| {
        g.as_ref().map(|h| {
            (
                h.hid.clone(),
                h.me.clone(),
                h.key,
                h.my_name.clone(),
                h.my_color.clone(),
                h.port,
            )
        })
    }) else {
        return false;
    };
    let p = proof(&key, &hid, &me, &keys.bind);
    let hello = json!({ "t": "member", "hid": hid, "id": me, "name": name, "color": color, "port": my_port, "proof": p });
    let peer = id.clone();
    let conn = next_conn();
    let tx = run_channel(
        ws,
        keys,
        Some(serde_json::to_vec(&hello).unwrap_or_default()),
        move |v, tx| {
            if v["t"] == "_closed" {
                member_closed(&peer, conn);
                return false;
            }
            on_member_msg(&peer, v, tx);
            true
        },
    )
    .await;
    let mut ok = false;
    if let Ok(mut g) = STATE.lock() {
        if let Some(m) = g.as_mut().and_then(|h| h.members.get_mut(&id)) {
            m.tx = Some(tx);
            m.my_ip = my_ip;
            m.dial = true;
            m.conn = conn;
            ok = true;
        }
    }
    emit_view();
    ok
}

/// Someone connected to this PC's huddle server.
async fn accept_conn(tcp: TcpStream, addr: SocketAddr) {
    let my_ip = tcp.local_addr().ok().map(|a| a.ip());
    let Ok(Ok(mut ws)) = tokio::time::timeout(
        Duration::from_secs(10),
        tokio_tungstenite::accept_async(tcp),
    )
    .await
    else {
        return;
    };
    let Some(keys) = handshake(&mut ws, false).await else {
        return;
    };
    let code = keys.code.clone();
    let bind = keys.bind;
    let conn = next_conn();
    // The first sealed message says who it is; handled inside the reader.
    let who: std::sync::Arc<Mutex<Option<String>>> = Default::default();
    let who_r = who.clone();
    let peer_ip = addr.ip().to_string();
    run_channel(ws, keys, None, move |v, tx| {
        let current = who_r.lock().ok().and_then(|w| w.clone());
        match (current, v["t"].as_str()) {
            (_, Some("_closed")) => {
                if let Some(id) = who_r.lock().ok().and_then(|w| w.clone()) {
                    member_closed(&id, conn);
                }
                false
            }
            (None, Some("join")) => {
                let name = v["name"]
                    .as_str()
                    .unwrap_or("A teammate")
                    .chars()
                    .take(40)
                    .collect::<String>();
                let port = v["port"].as_u64().unwrap_or(0) as u16;
                let tx = tx.clone();
                let who = who_r.clone();
                let ip = peer_ip.clone();
                let code = code.clone();
                tokio::spawn(async move {
                    match ask_host(&name, &code).await {
                        Ok(()) => {
                            admit(&name, &ip, port, &tx, my_ip, &who, conn);
                        }
                        Err(why) => send_json(&tx, json!({ "t": "denied", "why": why })),
                    }
                });
                true
            }
            (None, Some("member")) => {
                let ok = STATE.lock().ok().and_then(|g| {
                    g.as_ref().map(|h| {
                        v["hid"] == h.hid.as_str()
                            && v["proof"].as_str()
                                == Some(
                                    proof(&h.key, &h.hid, v["id"].as_str().unwrap_or(""), &bind)
                                        .as_str(),
                                )
                    })
                });
                if ok != Some(true) {
                    return false;
                }
                let id = v["id"].as_str().unwrap_or("").to_string();
                if let Ok(mut g) = STATE.lock() {
                    if let Some(h) = g.as_mut() {
                        let m = h.members.entry(id.clone()).or_insert(Member {
                            name: v["name"].as_str().unwrap_or("Teammate").into(),
                            color: v["color"].as_str().unwrap_or(COLORS[3]).into(),
                            ip: peer_ip.clone(),
                            port: v["port"].as_u64().unwrap_or(0) as u16,
                            tx: None,
                            my_ip,
                            dial: false,
                            conn,
                            host: false,
                        });
                        m.tx = Some(tx.clone());
                        m.my_ip = my_ip;
                        m.conn = conn;
                        // They may have moved (new Wi-Fi, new address): remember where they are now.
                        m.ip = peer_ip.clone();
                        if let Some(p) = v["port"].as_u64().filter(|p| *p > 0) {
                            m.port = p as u16;
                        }
                    }
                }
                if let Ok(mut w) = who_r.lock() {
                    *w = Some(id);
                }
                emit_view();
                true
            }
            (Some(id), _) => {
                on_member_msg(&id, v, tx);
                true
            }
            // Anything else before the hello is answered: ignore it (don't drop the connection).
            _ => true,
        }
    })
    .await;
}

/// Host: show "<name> wants to join" with the check code; wait for Allow.
async fn ask_host(name: &str, code: &str) -> Result<(), String> {
    let (host, count) = STATE
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|h| (h.host, h.members.len() + 1)))
        .unwrap_or((false, 0));
    if !host {
        return Err("This laptop isn't the huddle's host.".into());
    }
    if count >= FREE_MAX_LAPTOPS && !crate::license::is_pro() {
        if let Some(a) = app() {
            let _ = a.emit("huddle-full", json!({ "name": name }));
        }
        return Err(format!("This huddle is full: free huddles are up to {FREE_MAX_LAPTOPS} laptops. The host can make it bigger with PinchDrop Pro."));
    }
    let req = rand_hex(4);
    let (tx, rx) = oneshot::channel();
    if let Ok(mut a) = JOIN_ANSWERS.lock() {
        a.insert(req.clone(), tx);
    }
    if let Some(a) = app() {
        // The host has to answer: bring the PinchDrop window up on the Huddle page.
        crate::show_main_route(a, "huddle");
        let _ = a.emit(
            "huddle-join-request",
            json!({ "reqId": req, "name": name, "code": code }),
        );
    }
    match tokio::time::timeout(Duration::from_secs(60), rx).await {
        Ok(Ok(true)) => Ok(()),
        Ok(Ok(false)) => Err("The host said not now.".into()),
        _ => {
            if let Ok(mut a) = JOIN_ANSWERS.lock() {
                a.remove(&req);
            }
            Err("The host didn't answer.".into())
        }
    }
}

pub fn answer(req: &str, ok: bool) {
    if let Some(tx) = JOIN_ANSWERS.lock().ok().and_then(|mut a| a.remove(req)) {
        let _ = tx.send(ok);
    }
}

/// Host: add the newcomer, send it the key and the member list, tell everyone.
fn admit(
    name: &str,
    ip: &str,
    port: u16,
    tx: &mpsc::UnboundedSender<Vec<u8>>,
    my_ip: Option<IpAddr>,
    who: &Mutex<Option<String>>,
    conn: u64,
) -> Option<String> {
    let id = rand_hex(4);
    let mut g = STATE.lock().ok()?;
    let h = g.as_mut()?;
    // Know who this connection is *before* the welcome goes out: the newcomer may answer at once.
    if let Ok(mut w) = who.lock() {
        *w = Some(id.clone());
    }
    let color = COLORS[(h.members.len() + 1) % COLORS.len()].to_string();
    let mut list =
        vec![json!({ "id": h.me, "name": h.my_name, "color": h.my_color, "host": true })];
    for (mid, m) in &h.members {
        list.push(
            json!({ "id": mid, "name": m.name, "color": m.color, "ip": m.ip, "port": m.port }),
        );
    }
    send_json(
        tx,
        json!({ "t": "welcome", "hid": h.hid, "name": h.name, "key": b64().encode(h.key), "you": id, "color": color, "members": list, "code": h.code }),
    );
    h.members.insert(
        id.clone(),
        Member {
            name: name.into(),
            color: color.clone(),
            ip: ip.into(),
            port,
            tx: Some(tx.clone()),
            my_ip,
            dial: false,
            conn,
            host: false,
        },
    );
    let note =
        json!({ "t": "joined", "id": id, "name": name, "color": color, "ip": ip, "port": port });
    for (mid, m) in &h.members {
        if *mid != id {
            if let Some(t) = &m.tx {
                send_json(t, note.clone());
            }
        }
    }
    drop(g);
    if let Ok(g) = STATE.lock() {
        if let Some(h) = g.as_ref() {
            advertise(h); // the member count in the announcement
        }
    }
    emit_view();
    Some(id)
}

/// How long a dropped-out teammate stays (greyed out) while their laptop tries to come back.
const RECONNECT_FOR: Duration = Duration::from_secs(120);

fn member_closed(id: &str, conn: u64) {
    // Their connection dropped (Wi-Fi blip, sleep, moved). Keep them, greyed out, and try again;
    // only "bye" (they left) or 2 minutes without them removes them.
    let dial = {
        let Ok(mut g) = STATE.lock() else { return };
        let Some(m) = g.as_mut().and_then(|h| h.members.get_mut(id)) else {
            return;
        };
        if m.conn != conn || m.tx.is_none() {
            return; // an older connection, or already handling it
        }
        m.tx = None;
        m.dial
    };
    emit_view();
    let id = id.to_string();
    tokio::spawn(async move {
        let since = Instant::now();
        // Both sides redial (whoever moved to a new address can still reach the other); the one
        // that dialed before goes first.
        let mut wait = if dial { 2u64 } else { 4 };
        loop {
            tokio::time::sleep(Duration::from_secs(wait)).await;
            let info = STATE.lock().ok().and_then(|g| {
                g.as_ref().and_then(|h| {
                    h.members
                        .get(&id)
                        .map(|m| (m.tx.is_some(), m.ip.clone(), m.port))
                })
            });
            let Some((online, ip, port)) = info else {
                return;
            }; // they left, or the huddle ended
            if online {
                return; // they came back (or we reached them)
            }
            if since.elapsed() > RECONNECT_FOR {
                member_removed(&id);
                return;
            }
            if port > 0 && dial_member(id.clone(), ip, port).await {
                return;
            }
            wait = (wait * 2).min(15);
        }
    });
}

/// Someone left (or stayed away too long). If it was the host, the huddle picks a new one.
fn member_removed(id: &str) {
    let was_host = STATE
        .lock()
        .ok()
        .and_then(|mut g| g.as_mut().and_then(|h| h.members.remove(id)))
        .map(|m| m.host)
        .unwrap_or(false);
    if was_host {
        elect_host();
    }
    emit_view();
}

/// The rule every laptop applies on its own, so they all agree without talking:
/// the lowest member id among those still in the huddle.
fn choose_host<'a>(me: &'a str, others: impl Iterator<Item = &'a String>) -> &'a str {
    others
        .map(String::as_str)
        .chain(std::iter::once(me))
        .min()
        .unwrap_or(me)
}

/// The host is gone: pick the new one (maybe this laptop).
fn elect_host() {
    let became = {
        let Ok(mut g) = STATE.lock() else { return };
        let Some(h) = g.as_mut() else { return };
        if h.host || h.members.values().any(|m| m.host) {
            return; // there's still a host
        }
        let new = choose_host(&h.me, h.members.keys()).to_string();
        if new == h.me {
            h.host = true;
            advertise(h);
            true
        } else {
            if let Some(m) = h.members.get_mut(&new) {
                m.host = true;
            }
            false
        }
    };
    if became {
        if let Some(a) = app() {
            notify(
                a,
                "You're the host now",
                "The host left, so this laptop lets new teammates in.",
            );
        }
    }
}
fn stop_server() {
    if let Ok(mut s) = SERVER.lock() {
        if let Some(srv) = s.take() {
            srv.task.abort();
            if let Some(d) = srv.mdns {
                let _ = d.shutdown();
            }
        }
    }
}

/// Leaves (or, for the host, ends) the huddle. The shelf and inbox are wiped.
pub fn leave() {
    let h = STATE.lock().ok().and_then(|mut g| g.take());
    if let Some(h) = h {
        for m in h.members.values() {
            if let Some(t) = &m.tx {
                send_json(t, json!({ "t": "bye" }));
            }
        }
    }
    stop_server();
    // Hotspot off (old name back), or back to the Wi-Fi this laptop was on. Off the UI thread.
    let saved = HOTSPOT_HOST.lock().ok().and_then(|mut x| x.take());
    let joined = JOINED_WIFI.lock().ok().and_then(|mut x| x.take());
    if saved.is_some() || joined.is_some() {
        std::thread::spawn(move || {
            if let Some(s) = saved {
                crate::hotspot::stop(&s);
            }
            if let Some((ssid, before)) = joined {
                crate::hotspot::disconnect(&ssid, before.as_deref());
            }
        });
    }
    if let Ok(mut s) = SHARES.lock() {
        for (_, t) in s.drain() {
            t.abort();
        }
    }
    if let Ok(mut s) = SHELF.lock() {
        s.clear();
    }
    let dirs: Vec<PathBuf> = INBOX
        .lock()
        .map(|mut i| i.drain(..).map(|x| x.dir).collect())
        .unwrap_or_default();
    for d in dirs {
        let _ = std::fs::remove_dir_all(d);
    }
    emit_view();
    emit_shelf();
    emit_inbox();
}

// ---------------------------------------------------------------- join codes and the hotspot fallback

/// Host: share this laptop's Mobile Hotspot for the huddle (for Wi-Fi that keeps laptops apart).
pub async fn hotspot_on() -> Result<HuddleView, String> {
    let code = STATE
        .lock()
        .ok()
        .and_then(|g| g.as_ref().filter(|h| h.host).map(|h| h.code.clone()))
        .ok_or("Start a huddle first.")?;
    if HOTSPOT_HOST.lock().map(|x| x.is_some()).unwrap_or(false) {
        return Ok(view());
    }
    let (ssid, pass) = (
        crate::hotspot::ssid_for(&code),
        crate::hotspot::pass_for(&code),
    );
    let saved = tokio::task::spawn_blocking(move || crate::hotspot::start(&ssid, &pass))
        .await
        .map_err(|e| e.to_string())??;
    if let Ok(mut x) = HOTSPOT_HOST.lock() {
        *x = Some(saved);
    }
    // Announce on the hotspot's network too (it has its own address).
    tokio::time::sleep(Duration::from_secs(2)).await;
    if let Ok(g) = STATE.lock() {
        if let Some(h) = g.as_ref() {
            advertise(h);
        }
    }
    emit_view();
    Ok(view())
}

pub async fn hotspot_off() -> HuddleView {
    let saved = HOTSPOT_HOST.lock().ok().and_then(|mut x| x.take());
    if let Some(s) = saved {
        let _ = tokio::task::spawn_blocking(move || crate::hotspot::stop(&s)).await;
    }
    emit_view();
    view()
}

fn find_code(code: &str) -> Option<FoundHuddle> {
    find().into_iter().find(|f| f.code == code)
}

/// Joins by code: first on this Wi-Fi; if the huddle isn't visible here, through the host's
/// hotspot (connects to it, joins, and comes back to this Wi-Fi when leaving).
pub async fn join_code(app: AppHandle, input: String) -> Result<HuddleView, String> {
    let code =
        normalize_code(&input).ok_or("A join code has 8 letters and numbers, like KX7Q-49MZ.")?;
    let c = code.clone();
    if let Some(f) = tokio::task::spawn_blocking(move || find_code(&c))
        .await
        .ok()
        .flatten()
    {
        return join(app, f.ip, f.port).await;
    }
    // Not visible here: go through the host's hotspot.
    let (ssid, pass) = (
        crate::hotspot::ssid_for(&code),
        crate::hotspot::pass_for(&code),
    );
    let tmp = crate::outbox_dir(&app);
    let s2 = ssid.clone();
    let before = tokio::task::spawn_blocking(move || crate::hotspot::connect(&s2, &pass, &tmp))
        .await
        .map_err(|e| e.to_string())??;
    if let Ok(mut x) = JOINED_WIFI.lock() {
        *x = Some((ssid.clone(), before.clone()));
    }
    let _ = app.emit("huddle-joining", json!({ "code": null, "via": ssid }));
    // Find it on the hotspot (discovery, or the hotspot's fixed address).
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut last = String::from("The huddle didn't show up on the hotspot.");
    while Instant::now() < deadline {
        let c = code.clone();
        if let Some(f) = tokio::task::spawn_blocking(move || find_code(&c))
            .await
            .ok()
            .flatten()
        {
            return join(app, f.ip, f.port)
                .await
                .inspect_err(|_| restore_wifi());
        }
        match join(app.clone(), HOTSPOT_HOST_IP.to_string(), HUDDLE_PORT).await {
            Ok(v) => return Ok(v),
            Err(e) => last = e,
        }
    }
    restore_wifi();
    Err(last)
}

fn restore_wifi() {
    if let Some((ssid, before)) = JOINED_WIFI.lock().ok().and_then(|mut x| x.take()) {
        std::thread::spawn(move || crate::hotspot::disconnect(&ssid, before.as_deref()));
    }
}

// ---------------------------------------------------------------- messages between members

fn member_name(id: &str) -> String {
    STATE
        .lock()
        .ok()
        .and_then(|g| {
            g.as_ref()
                .and_then(|h| h.members.get(id).map(|m| m.name.clone()))
        })
        .unwrap_or_else(|| "A teammate".into())
}

fn on_member_msg(from: &str, v: Value, tx: &mpsc::UnboundedSender<Vec<u8>>) {
    let Some(app) = app().cloned() else { return };
    let from_name = member_name(from);
    let to_all = v["all"].as_bool().unwrap_or(false);
    match v["t"].as_str().unwrap_or("") {
        "joined" => {
            // The host says someone new is in; they'll connect to us.
            if let Ok(mut g) = STATE.lock() {
                if let Some(h) = g.as_mut() {
                    let id = v["id"].as_str().unwrap_or("").to_string();
                    if !id.is_empty() && id != h.me {
                        h.members.entry(id).or_insert(Member {
                            name: v["name"].as_str().unwrap_or("Teammate").into(),
                            color: v["color"].as_str().unwrap_or(COLORS[4]).into(),
                            ip: v["ip"].as_str().unwrap_or("").into(),
                            port: v["port"].as_u64().unwrap_or(0) as u16,
                            tx: None,
                            my_ip: None,
                            dial: false,
                            conn: 0,
                            host: false,
                        });
                    }
                }
            }
            emit_view();
        }
        "bye" => member_removed(from),
        "text" => {
            let text: String = v["text"]
                .as_str()
                .unwrap_or("")
                .chars()
                .take(200_000)
                .collect();
            if text.is_empty() {
                return;
            }
            crate::clip::write(&text);
            let lines = text.lines().count().max(1);
            let summary = format!("{lines} line{}", if lines == 1 { "" } else { "s" });
            shelf_add(ShelfItem {
                id: rand_hex(4),
                from: from.into(),
                from_name: from_name.clone(),
                to_all,
                kind: "text".into(),
                summary: summary.clone(),
                text: Some(text),
                path: None,
                url: None,
                at: now(),
                mine: false,
            });
            notify(
                &app,
                &from_name,
                &format!("{summary} on your clipboard. Ctrl+V"),
            );
        }
        "url" => {
            let url = v["url"].as_str().unwrap_or("").to_string();
            if !(url.starts_with("http://") || url.starts_with("https://")) {
                return;
            }
            let label = v["label"].as_str().unwrap_or("their app").to_string();
            shelf_add(ShelfItem {
                id: rand_hex(4),
                from: from.into(),
                from_name: from_name.clone(),
                to_all,
                kind: "url".into(),
                summary: label.clone(),
                text: None,
                path: None,
                url: Some(url.clone()),
                at: now(),
                mine: false,
            });
            let _ = tauri_plugin_opener::OpenerExt::opener(&app).open_url(&url, None::<&str>);
            notify(
                &app,
                &from_name,
                &format!("Opened {label} from their laptop"),
            );
        }
        "files" => on_files_offer(&app, from, &from_name, &v, to_all),
        "chunk" => on_chunk(&v),
        "end" => on_files_end(&app, &v),
        "pull" => {
            let repo = STATE
                .lock()
                .ok()
                .and_then(|g| g.as_ref().and_then(|h| h.last_repo.clone()));
            match repo {
                Some(dir) => {
                    let who = from.to_string();
                    tokio::spawn(async move {
                        let _ = send_changes(Some(who), dir).await;
                    });
                }
                None => send_json(
                    tx,
                    json!({ "t": "note", "text": "hasn't shared a project yet." }),
                ),
            }
        }
        "note" => notify(&app, &from_name, v["text"].as_str().unwrap_or("")),
        _ => {}
    }
}

/// A small heads-up on the pill (and the Huddle page).
fn notify(app: &AppHandle, from: &str, text: &str) {
    let _ = app.emit("huddle-drop", json!({ "from": from, "text": text }));
    crate::force_show_pill(app, 6);
}

// ---------------------------------------------------------------- sending

fn targets(to: Option<&str>) -> Vec<(String, mpsc::UnboundedSender<Vec<u8>>)> {
    STATE
        .lock()
        .ok()
        .and_then(|g| {
            g.as_ref().map(|h| {
                h.members
                    .iter()
                    .filter(|(id, _)| to.map_or(true, |t| t == id.as_str()))
                    .filter_map(|(id, m)| m.tx.clone().map(|t| (id.clone(), t)))
                    .collect()
            })
        })
        .unwrap_or_default()
}

fn to_label(to: Option<&str>) -> String {
    match to {
        None => "everyone".into(),
        Some(id) => member_name(id),
    }
}

fn my_shelf(
    kind: &str,
    to: Option<&str>,
    summary: String,
    text: Option<String>,
    url: Option<String>,
) {
    let me = STATE
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|h| (h.me.clone(), h.my_name.clone())))
        .unwrap_or_default();
    shelf_add(ShelfItem {
        id: rand_hex(4),
        from: me.0,
        from_name: format!("You → {}", to_label(to)),
        to_all: to.is_none(),
        kind: kind.into(),
        summary,
        text,
        path: None,
        url,
        at: now(),
        mine: true,
    });
}

pub fn send_text(to: Option<String>, text: String) -> Result<String, String> {
    let text: String = text.chars().take(200_000).collect();
    if text.trim().is_empty() {
        return Err("Nothing to send: copy some code or text first.".into());
    }
    let t = targets(to.as_deref());
    if t.is_empty() {
        return Err("Nobody's connected right now.".into());
    }
    for (_, tx) in &t {
        send_json(
            tx,
            json!({ "t": "text", "text": text, "all": to.is_none() }),
        );
    }
    let lines = text.lines().count().max(1);
    my_shelf(
        "text",
        to.as_deref(),
        format!("{lines} line{}", if lines == 1 { "" } else { "s" }),
        Some(text),
        None,
    );
    Ok(format!("Sent to {}", to_label(to.as_deref())))
}

pub fn send_clipboard(to: Option<String>) -> Result<String, String> {
    let (text, _) = crate::clip::read().ok_or("Your clipboard is empty. Copy something first.")?;
    send_text(to, text)
}

/// Files / folders dropped on a face. A folder that's a git project sends its changed files.
pub async fn send_paths(to: Option<String>, paths: Vec<String>) -> Result<String, String> {
    if paths.len() == 1 {
        let p = PathBuf::from(&paths[0]);
        if p.is_dir() && git_root(&p).is_some() {
            return send_changes(to, p).await;
        }
    }
    let label = match paths.len() {
        1 => Path::new(&paths[0])
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Files".into()),
        n => format!("{n} items"),
    };
    let mut files: Vec<(String, PathBuf, u64)> = Vec::new();
    for p in &paths {
        let root = PathBuf::from(p);
        let base = root.parent().map(Path::to_path_buf).unwrap_or_default();
        collect(&root, &base, &mut files, 0);
    }
    send_file_set(
        to,
        "files",
        &label,
        None,
        files
            .into_iter()
            .map(|(rel, abs, size)| (rel, Some(abs), size, "M".into()))
            .collect(),
    )
    .await
}

fn collect(path: &Path, base: &Path, out: &mut Vec<(String, PathBuf, u64)>, depth: u32) {
    if depth > 12 || out.len() > 5000 {
        return;
    }
    if path.is_dir() {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if matches!(
            name.as_str(),
            "node_modules"
                | ".git"
                | "target"
                | "dist"
                | "build"
                | ".next"
                | "__pycache__"
                | ".venv"
        ) {
            return;
        }
        if let Ok(rd) = std::fs::read_dir(path) {
            for e in rd.flatten() {
                collect(&e.path(), base, out, depth + 1);
            }
        }
    } else if let Ok(md) = std::fs::metadata(path) {
        if let Ok(rel) = path.strip_prefix(base) {
            out.push((
                rel.to_string_lossy().replace('\\', "/"),
                path.to_path_buf(),
                md.len(),
            ));
        }
    }
}

/// Sends a set of files: an offer, the chunks, then "end". `None` content = deleted file.
async fn send_file_set(
    to: Option<String>,
    kind: &str,
    label: &str,
    repo: Option<String>,
    files: Vec<(String, Option<PathBuf>, u64, String)>,
) -> Result<String, String> {
    let total: u64 = files.iter().map(|f| f.2).sum();
    if total > MAX_DROP_BYTES {
        return Err("That's over 500 MB. Huddle is for code and documents; use a normal send for big files.".into());
    }
    if files.is_empty() {
        return Err(if kind == "changes" {
            "No changes in that project yet.".into()
        } else {
            "Nothing to send: those folders are empty.".into()
        });
    }
    let t = targets(to.as_deref());
    if t.is_empty() {
        return Err("Nobody's connected right now.".into());
    }
    let id = rand_hex(6);
    let items: Vec<Value> = files
        .iter()
        .map(|(rel, _, size, st)| json!({ "path": rel, "size": size, "status": st }))
        .collect();
    let offer = json!({ "t": "files", "id": id, "kind": kind, "label": label, "repo": repo, "items": items, "all": to.is_none() });
    for (_, tx) in &t {
        send_json(tx, offer.clone());
    }
    for (i, (_, abs, _, _)) in files.iter().enumerate() {
        let Some(abs) = abs else { continue };
        let Ok(data) = tokio::fs::read(abs).await else {
            continue;
        };
        for (k, part) in data.chunks(CHUNK).enumerate() {
            let msg = json!({ "t": "chunk", "id": id, "i": i, "off": k * CHUNK, "data": b64().encode(part) });
            for (_, tx) in &t {
                send_json(tx, msg.clone());
            }
            tokio::task::yield_now().await;
        }
    }
    for (_, tx) in &t {
        send_json(tx, json!({ "t": "end", "id": id }));
    }
    let n = files.len();
    let summary = if kind == "changes" {
        format!(
            "{} · {n} changed file{}",
            label,
            if n == 1 { "" } else { "s" }
        )
    } else {
        format!("{label} · {n} file{}", if n == 1 { "" } else { "s" })
    };
    my_shelf(kind, to.as_deref(), summary, None, None);
    Ok(format!("Sent to {}", to_label(to.as_deref())))
}

// ---------------------------------------------------------------- receiving files

/// Only plain relative paths: no "..", no drive letters, no absolute paths.
fn safe_join(base: &Path, rel: &str) -> Option<PathBuf> {
    let rel = Path::new(rel);
    let mut out = base.to_path_buf();
    for c in rel.components() {
        match c {
            Component::Normal(p) => {
                let s = p.to_string_lossy();
                if s.contains(':') || s.trim().is_empty() {
                    return None;
                }
                out.push(p);
            }
            Component::CurDir => {}
            _ => return None,
        }
    }
    (out != base).then_some(out)
}

fn clean_name(s: &str) -> String {
    let c: String = s
        .chars()
        .filter(|c| c.is_alphanumeric() || " -_.".contains(*c))
        .take(40)
        .collect();
    let c = c.trim().trim_matches('.').to_string();
    if c.is_empty() {
        "Teammate".into()
    } else {
        c
    }
}

fn on_files_offer(app: &AppHandle, from: &str, from_name: &str, v: &Value, to_all: bool) {
    let id = v["id"].as_str().unwrap_or("").to_string();
    let kind = v["kind"].as_str().unwrap_or("files").to_string();
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return;
    }
    let base = if kind == "changes" {
        crate::outbox_dir(app).join(format!("huddle-{id}"))
    } else {
        crate::link::lift::save_dir(app)
            .join("Huddle")
            .join(clean_name(from_name))
    };
    let mut files = Vec::new();
    let mut listed = Vec::new();
    for it in v["items"].as_array().cloned().unwrap_or_default() {
        let rel = it["path"].as_str().unwrap_or("");
        let size = it["size"].as_u64().unwrap_or(0);
        let status = it["status"].as_str().unwrap_or("M").to_string();
        let Some(p) = safe_join(&base, rel) else {
            continue;
        };
        if status != "D" {
            if let Some(parent) = p.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&p, b""); // created now, filled by the chunks
        }
        files.push((p, size));
        listed.push(ChangeFile {
            path: rel.to_string(),
            status,
            size,
        });
    }
    if let Ok(mut r) = RECEIVING.lock() {
        r.insert(
            id.clone(),
            Receiving {
                kind: kind.clone(),
                base: base.clone(),
                files,
                from: from.into(),
                label: v["label"].as_str().unwrap_or("Files").into(),
                to_all,
            },
        );
    }
    if kind == "changes" {
        let repo: String = v["repo"]
            .as_str()
            .unwrap_or("project")
            .chars()
            .take(60)
            .collect();
        let target = project_path(app, &repo).map(|p| p.to_string_lossy().to_string());
        if let Ok(mut i) = INBOX.lock() {
            i.insert(
                0,
                Incoming {
                    id,
                    from: from.into(),
                    from_name: from_name.into(),
                    repo,
                    files: listed,
                    ready: false,
                    at: now(),
                    target,
                    dir: base,
                },
            );
        }
        emit_inbox();
    }
}

fn on_chunk(v: &Value) {
    let id = v["id"].as_str().unwrap_or("");
    let i = v["i"].as_u64().unwrap_or(u64::MAX) as usize;
    let off = v["off"].as_u64().unwrap_or(0);
    let Ok(data) = b64().decode(v["data"].as_str().unwrap_or("")) else {
        return;
    };
    let path = RECEIVING.lock().ok().and_then(|r| {
        r.get(id)
            .and_then(|x| x.files.get(i).map(|f| (f.0.clone(), f.1)))
    });
    let Some((path, size)) = path else { return };
    if off + data.len() as u64 > size {
        return;
    }
    use std::io::{Seek, SeekFrom, Write};
    if let Ok(mut f) = std::fs::OpenOptions::new().write(true).open(&path) {
        let _ = f.seek(SeekFrom::Start(off));
        let _ = f.write_all(&data);
    }
}

fn on_files_end(app: &AppHandle, v: &Value) {
    let id = v["id"].as_str().unwrap_or("");
    let Some(r) = RECEIVING.lock().ok().and_then(|mut r| r.remove(id)) else {
        return;
    };
    let from_name = member_name(&r.from);
    if r.kind == "changes" {
        if let Ok(mut i) = INBOX.lock() {
            if let Some(x) = i.iter_mut().find(|x| x.id == id) {
                x.ready = true;
            }
        }
        emit_inbox();
        notify(
            app,
            &from_name,
            &format!("sent changes to {}. Open Huddle to accept", r.label),
        );
        return;
    }
    let n = r.files.len();
    let folder = r.base.to_string_lossy().to_string();
    shelf_add(ShelfItem {
        id: rand_hex(4),
        from: r.from.clone(),
        from_name: from_name.clone(),
        to_all: r.to_all,
        kind: "files".into(),
        summary: format!("{} · {n} file{}", r.label, if n == 1 { "" } else { "s" }),
        text: None,
        path: Some(folder),
        url: None,
        at: now(),
        mine: false,
    });
    notify(
        app,
        &from_name,
        &format!("sent {}: in Downloads\\PinchDrop\\Huddle", r.label),
    );
}

// ---------------------------------------------------------------- git changes

#[cfg(windows)]
fn git(dir: &Path, args: &[&str]) -> Option<String> {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .creation_flags(0x0800_0000)
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).to_string())
}

#[cfg(not(windows))]
fn git(dir: &Path, args: &[&str]) -> Option<String> {
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).to_string())
}

fn git_root(dir: &Path) -> Option<PathBuf> {
    git(dir, &["rev-parse", "--show-toplevel"]).map(|s| PathBuf::from(s.trim()))
}

/// The changed files in a project: (relative path, status "M" | "D").
pub fn changed_files(root: &Path) -> Vec<(String, String)> {
    let Some(out) = git(
        root,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    ) else {
        return vec![];
    };
    parse_status(&out)
}

fn parse_status(out: &str) -> Vec<(String, String)> {
    let mut res = Vec::new();
    let mut parts = out.split('\0').peekable();
    while let Some(entry) = parts.next() {
        if entry.len() < 4 {
            continue;
        }
        let (xy, path) = entry.split_at(3);
        let xy = xy.trim();
        if xy.starts_with('R') || xy.starts_with('C') {
            // "R  new\0old": the old name follows; it's gone.
            if let Some(old) = parts.next() {
                res.push((old.to_string(), "D".to_string()));
            }
        }
        let status = if xy.contains('D') { "D" } else { "M" };
        res.push((path.to_string(), status.to_string()));
    }
    res
}

pub async fn send_changes(to: Option<String>, dir: PathBuf) -> Result<String, String> {
    let root = git_root(&dir).ok_or("That folder isn't a git project.")?;
    let repo = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".into());
    let list = changed_files(&root);
    let files: Vec<(String, Option<PathBuf>, u64, String)> = list
        .into_iter()
        .filter_map(|(rel, st)| {
            if st == "D" {
                return Some((rel, None, 0, st));
            }
            let abs = safe_join(&root, &rel)?;
            let size = std::fs::metadata(&abs).ok().filter(|m| m.is_file())?.len();
            Some((rel, Some(abs), size, st))
        })
        .collect();
    if let Ok(mut g) = STATE.lock() {
        if let Some(h) = g.as_mut() {
            h.last_repo = Some(root.clone());
        }
    }
    send_file_set(to, "changes", &repo, Some(repo.clone()), files).await
}

pub fn pull(member: &str) -> Result<(), String> {
    let t = targets(Some(member));
    let (_, tx) = t.first().ok_or("They're not connected right now.")?;
    send_json(tx, json!({ "t": "pull" }));
    Ok(())
}

// Where each project lives on this PC (remembered after the first Accept).
fn projects_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("huddle-projects.json")
}

fn project_path(app: &AppHandle, repo: &str) -> Option<PathBuf> {
    let s = std::fs::read_to_string(projects_path(app)).ok()?;
    let v: Value = serde_json::from_str(&s).ok()?;
    let p = PathBuf::from(v[repo].as_str()?);
    p.is_dir().then_some(p)
}

fn remember_project(app: &AppHandle, repo: &str, path: &Path) {
    let file = projects_path(app);
    let mut v: Value = std::fs::read_to_string(&file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}));
    v[repo] = json!(path.to_string_lossy());
    let _ = std::fs::write(file, serde_json::to_string_pretty(&v).unwrap_or_default());
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Clash {
    pub path: String,
    pub mine: String,
    pub theirs: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptResult {
    pub applied: usize,
    /// Files you also changed: pick for each (shown side by side).
    pub clashes: Vec<Clash>,
    pub folder: String,
}

fn read_text(p: &Path) -> String {
    std::fs::read(p)
        .map(|b| String::from_utf8_lossy(&b[..b.len().min(200_000)]).to_string())
        .unwrap_or_default()
}

/// Applies a teammate's changes to the project here. Files you've also changed (and that differ)
/// are returned as clashes unless a choice was given for them ("mine" | "theirs").
/// Deleted files go to the Recycle Bin, never permanently.
pub fn accept(
    app: &AppHandle,
    id: &str,
    folder: Option<String>,
    choices: HashMap<String, String>,
) -> Result<AcceptResult, String> {
    let inc = INBOX
        .lock()
        .ok()
        .and_then(|i| i.iter().find(|x| x.id == id).cloned())
        .ok_or("That change set is gone.")?;
    if !inc.ready {
        return Err("Still arriving, give it a second.".into());
    }
    let target = match folder
        .map(PathBuf::from)
        .or_else(|| project_path(app, &inc.repo))
    {
        Some(p) if p.is_dir() => p,
        _ => return Err("NEED_FOLDER".into()),
    };
    let mine_changed: HashSet<String> =
        changed_files(&target).into_iter().map(|(p, _)| p).collect();
    // First pass: find clashes.
    let mut clashes = Vec::new();
    for f in &inc.files {
        if choices.contains_key(&f.path) || !mine_changed.contains(&f.path) {
            continue;
        }
        let (Some(local), Some(incoming)) =
            (safe_join(&target, &f.path), safe_join(&inc.dir, &f.path))
        else {
            continue;
        };
        let mine = read_text(&local);
        let theirs = if f.status == "D" {
            String::new()
        } else {
            read_text(&incoming)
        };
        if mine != theirs {
            clashes.push(Clash {
                path: f.path.clone(),
                mine,
                theirs,
            });
        }
    }
    if !clashes.is_empty() {
        return Ok(AcceptResult {
            applied: 0,
            clashes,
            folder: target.to_string_lossy().to_string(),
        });
    }
    let mut applied = 0;
    for f in &inc.files {
        if choices.get(&f.path).map(String::as_str) == Some("mine") {
            continue;
        }
        let Some(local) = safe_join(&target, &f.path) else {
            continue;
        };
        if f.status == "D" {
            if local.exists() && trash::delete(&local).is_ok() {
                applied += 1;
            }
            continue;
        }
        let Some(incoming) = safe_join(&inc.dir, &f.path) else {
            continue;
        };
        if let Some(parent) = local.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if std::fs::copy(&incoming, &local).is_ok() {
            applied += 1;
        }
    }
    remember_project(app, &inc.repo, &target);
    dismiss(id);
    let from = inc.from_name.clone();
    shelf_add(ShelfItem {
        id: rand_hex(4),
        from: inc.from.clone(),
        from_name: from,
        to_all: false,
        kind: "changes".into(),
        summary: format!(
            "{} · {applied} file{} applied",
            inc.repo,
            if applied == 1 { "" } else { "s" }
        ),
        text: None,
        path: Some(target.to_string_lossy().to_string()),
        url: None,
        at: now(),
        mine: false,
    });
    Ok(AcceptResult {
        applied,
        clashes: vec![],
        folder: target.to_string_lossy().to_string(),
    })
}

pub fn dismiss(id: &str) {
    let dir = INBOX.lock().ok().and_then(|mut i| {
        let pos = i.iter().position(|x| x.id == id)?;
        Some(i.remove(pos).dir)
    });
    if let Some(d) = dir {
        let _ = std::fs::remove_dir_all(d);
    }
    emit_inbox();
}

/// Opens a shelf item: its link in the browser, or its folder in Explorer. Only shelf items.
pub fn open_item(app: &AppHandle, id: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let item = SHELF
        .lock()
        .ok()
        .and_then(|s| s.iter().find(|x| x.id == id).cloned())
        .ok_or("That item is gone.")?;
    if let Some(url) = item
        .url
        .filter(|u| u.starts_with("http://") || u.starts_with("https://"))
    {
        return app
            .opener()
            .open_url(url, None::<&str>)
            .map_err(|e| e.to_string());
    }
    if let Some(path) = item.path {
        return app
            .opener()
            .open_path(path, None::<&str>)
            .map_err(|e| e.to_string());
    }
    Err("Nothing to open.".into())
}

// ---------------------------------------------------------------- sharing a running app

/// "localhost:3000", "http://127.0.0.1:5173/path", "3000" → (port, path).
pub fn parse_local(input: &str) -> Option<(u16, String)> {
    let s = input.trim();
    let s = s
        .strip_prefix("http://")
        .or_else(|| s.strip_prefix("https://"))
        .unwrap_or(s);
    let (hostport, path) = match s.find('/') {
        Some(i) => (&s[..i], s[i..].to_string()),
        None => (s, "/".to_string()),
    };
    let port = match hostport.rsplit_once(':') {
        Some((host, port)) => {
            if !matches!(host, "localhost" | "127.0.0.1" | "0.0.0.0" | "[::1]") {
                return None;
            }
            port.parse().ok()?
        }
        None => hostport.parse().ok()?,
    };
    (port > 0).then_some((port, path))
}

/// Shares a dev server running on this laptop. A forwarder on the LAN lets only huddle members in.
pub async fn share(to: Option<String>, input: String) -> Result<String, String> {
    let (port, path) =
        parse_local(&input).ok_or("Type the address of your running app, like localhost:3000.")?;
    if TcpStream::connect(("127.0.0.1", port)).await.is_err() {
        return Err(format!("Nothing is running on localhost:{port} right now."));
    }
    let listener = TcpListener::bind("0.0.0.0:0")
        .await
        .map_err(|e| e.to_string())?;
    let fport = listener.local_addr().map_err(|e| e.to_string())?.port();
    let task = tokio::spawn(async move {
        while let Ok((mut inbound, addr)) = listener.accept().await {
            // Only teammates.
            let allowed = STATE
                .lock()
                .ok()
                .and_then(|g| {
                    g.as_ref()
                        .map(|h| h.members.values().any(|m| m.ip == addr.ip().to_string()))
                })
                .unwrap_or(false);
            if !allowed {
                continue;
            }
            tokio::spawn(async move {
                if let Ok(mut out) = TcpStream::connect(("127.0.0.1", port)).await {
                    let _ = tokio::io::copy_bidirectional(&mut inbound, &mut out).await;
                }
            });
        }
    });
    if let Ok(mut s) = SHARES.lock() {
        s.insert(fport, task);
    }
    let label = format!("localhost:{port}");
    let t: Vec<(String, mpsc::UnboundedSender<Vec<u8>>, Option<IpAddr>)> = STATE
        .lock()
        .ok()
        .and_then(|g| {
            g.as_ref().map(|h| {
                h.members
                    .iter()
                    .filter(|(id, _)| to.as_deref().map_or(true, |x| x == id.as_str()))
                    .filter_map(|(id, m)| m.tx.clone().map(|t| (id.clone(), t, m.my_ip)))
                    .collect()
            })
        })
        .unwrap_or_default();
    if t.is_empty() {
        return Err("Nobody's connected right now.".into());
    }
    let fallback = crate::link::lan_hosts().into_iter().next();
    for (_, tx, my_ip) in &t {
        let ip = my_ip
            .map(|i| i.to_string())
            .or_else(|| fallback.clone())
            .unwrap_or_default();
        send_json(
            tx,
            json!({ "t": "url", "url": format!("http://{ip}:{fport}{path}"), "label": label, "all": to.is_none() }),
        );
    }
    my_shelf(
        "url",
        to.as_deref(),
        format!("{label} (shared)"),
        None,
        None,
    );
    Ok(format!(
        "{label} is open on {}'s screen",
        to_label(to.as_deref())
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sealed_frames_round_trip_and_reject_replays() {
        let shared = [7u8; 32];
        let client = derive(&shared, true).unwrap();
        let server = derive(&shared, false).unwrap();
        assert_eq!(client.code, server.code);
        let mut c = 0;
        let f1 = seal(&client.send, &mut c, b"hello").unwrap();
        let f2 = seal(&client.send, &mut c, b"world").unwrap();
        let mut last = 0;
        assert_eq!(open(&server.recv, &mut last, &f1).unwrap(), b"hello");
        assert_eq!(open(&server.recv, &mut last, &f2).unwrap(), b"world");
        assert!(
            open(&server.recv, &mut last, &f1).is_none(),
            "replay refused"
        );
        // tampered
        let mut bad = seal(&client.send, &mut c, b"x").unwrap();
        let n = bad.len() - 1;
        bad[n] ^= 1;
        assert!(open(&server.recv, &mut last, &bad).is_none());
        // the other direction uses the other key
        let mut s = 0;
        let back = seal(&server.send, &mut s, b"ok").unwrap();
        let mut l2 = 0;
        assert_eq!(open(&client.recv, &mut l2, &back).unwrap(), b"ok");
    }

    #[test]
    fn member_proof_is_bound_to_the_connection() {
        let key = [3u8; 32];
        let a = proof(&key, "h1", "m1", &[1u8; 32]);
        assert_eq!(a, proof(&key, "h1", "m1", &[1u8; 32]));
        assert_ne!(a, proof(&key, "h1", "m1", &[2u8; 32]));
        assert_ne!(a, proof(&[4u8; 32], "h1", "m1", &[1u8; 32]));
    }

    #[test]
    fn paths_stay_inside() {
        let base = Path::new("C:/x");
        assert!(safe_join(base, "a/b.txt").is_some());
        assert!(safe_join(base, "../evil").is_none());
        assert!(safe_join(base, "/etc/passwd").is_none());
        assert!(safe_join(base, "C:/Windows/x").is_none());
        assert!(safe_join(base, "a/../../b").is_none());
        assert!(safe_join(base, "").is_none());
    }

    #[test]
    fn reads_git_status() {
        let out = " M src/a.ts\0?? new.txt\0 D gone.rs\0R  b2.ts\0b.ts\0";
        let v = parse_status(out);
        assert!(v.contains(&("src/a.ts".into(), "M".into())));
        assert!(v.contains(&("new.txt".into(), "M".into())));
        assert!(v.contains(&("gone.rs".into(), "D".into())));
        assert!(v.contains(&("b2.ts".into(), "M".into())));
        assert!(v.contains(&("b.ts".into(), "D".into())));
    }

    #[test]
    fn everyone_picks_the_same_new_host() {
        let ids = ["7c1e".to_string(), "0a9f".to_string(), "b220".to_string()];
        // Seen from each laptop (its own id + the others), the answer is the same.
        for (i, me) in ids.iter().enumerate() {
            let others: Vec<String> = ids
                .iter()
                .enumerate()
                .filter(|(j, _)| *j != i)
                .map(|(_, x)| x.clone())
                .collect();
            assert_eq!(choose_host(me, others.iter()), "0a9f");
        }
        let none: Vec<String> = vec![];
        assert_eq!(choose_host("solo", none.iter()), "solo");
    }

    #[test]
    fn join_codes() {
        let c = new_code();
        assert_eq!(c.len(), 8);
        assert_eq!(
            normalize_code(&format!("{}-{}", &c[..4], &c[4..]).to_lowercase()),
            Some(c.clone())
        );
        assert_eq!(normalize_code("KX7Q 49MZ"), Some("KX7Q49MZ".into()));
        assert_eq!(normalize_code("KX7Q-49M"), None);
        assert_eq!(normalize_code("KX7Q-49M0"), None, "0 isn't used");
    }

    #[test]
    fn understands_local_addresses() {
        assert_eq!(parse_local("localhost:3000"), Some((3000, "/".into())));
        assert_eq!(
            parse_local("http://127.0.0.1:5173/app?x=1"),
            Some((5173, "/app?x=1".into()))
        );
        assert_eq!(parse_local("8080"), Some((8080, "/".into())));
        assert_eq!(parse_local("example.com:80"), None);
        assert_eq!(parse_local("localhost"), None);
    }
}
