//! v2 · Laptop ↔ laptop (LINK-v1 §6.8).
//!
//! Every PC already runs the encrypted link server the phone talks to. To pair two laptops,
//! one of them (B) connects to the other (A) *as a client*, exactly like a phone: it finds A on
//! the Wi-Fi (mDNS), both screens show the same 6-digit code, both users confirm. That one
//! pairing works both ways over the same connection:
//!
//! * A → B: A's "in the air" (`hold.offer`) reaches B too; B's webcam catches it with an open
//!   hand (`hold.catch`), A sends it (`push.offer`), and B pulls the files (`chunk.req`).
//! * B → A: B's "in the air" goes to A as a lift (`lift.offer`, §6.5); A's webcam catches it,
//!   and A pulls the files from B (`lift.req`).
//!
//! B keeps A's certificate fingerprint and a shared secret (peers.json), and reconnects by
//! itself. Files land in Downloads\PinchDrop; names and folders from the other PC are cleaned
//! so nothing is ever written outside that folder.

use super::*;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;
use tokio_rustls::TlsConnector;

/// A PC this PC has paired with as a client.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub pc_id: String,
    pub name: String,
    pub fingerprint: String,
    pub device_id: String,
    pub secret: String,
    pub host: String,
    pub port: u16,
    pub paired_at: u64,
}

/// Another PinchDrop PC seen on the Wi-Fi.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundPc {
    pub pc_id: String,
    pub name: String,
    pub hosts: Vec<String>,
    pub port: u16,
    pub fingerprint: String,
    pub paired: bool,
}

/// Pairing progress for the UI (`peer-pair` event).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerPairView {
    /// connecting | code | waiting | done | failed
    pub stage: String,
    pub pc_name: String,
    pub code: Option<String>,
    pub message: Option<String>,
}

struct Live {
    tx: Tx,
    name: String,
}

/// Something this PC put in the air, offered to a peer as a lift (B → A).
struct Outgoing {
    pc_id: String,
    files: Vec<transfer::FileEntry>,
}

static PEERS: LazyLock<Mutex<Vec<Peer>>> = LazyLock::new(Default::default);
static LIVE: LazyLock<Mutex<HashMap<String, Live>>> = LazyLock::new(Default::default);
static FOUND: LazyLock<Mutex<Vec<FoundPc>>> = LazyLock::new(Default::default);
static PAIR_ANSWER: LazyLock<Mutex<Option<mpsc::UnboundedSender<bool>>>> =
    LazyLock::new(Default::default);
static OUTGOING: LazyLock<Mutex<HashMap<String, Outgoing>>> = LazyLock::new(Default::default);
/// Pulls in progress: transfer id → where its chunks go.
static PULLS: LazyLock<Mutex<HashMap<String, lift::ChunkTx>>> = LazyLock::new(Default::default);
/// Holds this PC caught from a peer; their push.offer is accepted without asking.
static CAUGHT: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(Default::default);
/// Peers with a supervisor running.
static RUNNING: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(Default::default);

const PEER_MODEL: &str = "Windows PC";

fn peers_path(app: &AppHandle) -> PathBuf {
    app.try_state::<crate::AppState>()
        .map(|s| s.config_dir.join("peers.json"))
        .unwrap_or_else(|| std::env::temp_dir().join("pinchdrop-peers.json"))
}

fn save_peers(app: &AppHandle) {
    if let Ok(p) = PEERS.lock() {
        if let Ok(json) = serde_json::to_string_pretty(&*p) {
            let _ = std::fs::write(peers_path(app), json);
        }
    }
}

pub fn is_peer_device_id(id: &str) -> bool {
    id.starts_with("pc:")
}

// ------------------------------------------------------------------ TLS with a pinned certificate

#[derive(Debug)]
struct PinVerifier {
    fingerprint: String,
    provider: Arc<rustls::crypto::CryptoProvider>,
}

impl rustls::client::danger::ServerCertVerifier for PinVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        // The other PC is trusted by its exact certificate, never by a certificate authority.
        if fingerprint(end_entity.as_ref()).eq_ignore_ascii_case(&self.fingerprint) {
            Ok(rustls::client::danger::ServerCertVerified::assertion())
        } else {
            Err(rustls::Error::General(
                "PC certificate doesn't match".into(),
            ))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        self.provider
            .signature_verification_algorithms
            .supported_schemes()
    }
}

type WsStream = tokio_tungstenite::WebSocketStream<tokio_rustls::client::TlsStream<TcpStream>>;

async fn connect(host: &str, port: u16, fp: &str) -> Result<WsStream, String> {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = rustls::ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(PinVerifier {
            fingerprint: fp.to_string(),
            provider,
        }))
        .with_no_client_auth();
    let tcp = timeout(Duration::from_secs(6), TcpStream::connect((host, port)))
        .await
        .map_err(|_| "timed out".to_string())?
        .map_err(|e| e.to_string())?;
    let name =
        rustls::pki_types::ServerName::try_from("pinchdrop.local").map_err(|e| e.to_string())?;
    let tls = timeout(
        Duration::from_secs(8),
        TlsConnector::from(Arc::new(config)).connect(name, tcp),
    )
    .await
    .map_err(|_| "timed out".to_string())?
    .map_err(|e| e.to_string())?;
    let url = format!("wss://{host}:{port}{WS_PATH}");
    let (ws, _) = timeout(
        Duration::from_secs(8),
        tokio_tungstenite::client_async(url, tls),
    )
    .await
    .map_err(|_| "timed out".to_string())?
    .map_err(|e| e.to_string())?;
    Ok(ws)
}

async fn next_text(ws: &mut WsStream, secs: u64) -> Option<Envelope> {
    loop {
        match timeout(Duration::from_secs(secs), ws.next()).await {
            Ok(Some(Ok(Message::Text(t)))) => return parse(&t),
            Ok(Some(Ok(Message::Close(_)))) | Ok(None) | Ok(Some(Err(_))) | Err(_) => return None,
            _ => continue,
        }
    }
}

// ------------------------------------------------------------------ discovery

/// Looks for other PinchDrop PCs on this Wi-Fi for a couple of seconds.
pub fn discover(own_pc_id: &str) -> Vec<FoundPc> {
    let Ok(daemon) = mdns_sd::ServiceDaemon::new() else {
        return Vec::new();
    };
    let Ok(rx) = daemon.browse(MDNS_SERVICE) else {
        return Vec::new();
    };
    let paired: HashSet<String> = PEERS
        .lock()
        .map(|p| p.iter().map(|x| x.pc_id.clone()).collect())
        .unwrap_or_default();
    let deadline = Instant::now() + Duration::from_millis(2500);
    let mut found: HashMap<String, FoundPc> = HashMap::new();
    while let Some(left) = deadline.checked_duration_since(Instant::now()) {
        let Ok(ev) = rx.recv_timeout(left) else { break };
        if let mdns_sd::ServiceEvent::ServiceResolved(info) = ev {
            let (Some(id), Some(fp)) = (
                info.get_property_val_str("id"),
                info.get_property_val_str("fp"),
            ) else {
                continue;
            };
            if id == own_pc_id || fp.len() != 64 {
                continue;
            }
            let mut hosts: Vec<String> = info
                .get_addresses()
                .iter()
                .filter(|a| a.is_ipv4())
                .map(|a| a.to_string())
                .collect();
            hosts.sort();
            found.insert(
                id.to_string(),
                FoundPc {
                    pc_id: id.to_string(),
                    name: info
                        .get_property_val_str("name")
                        .unwrap_or("PC")
                        .chars()
                        .take(40)
                        .collect(),
                    hosts,
                    port: info.get_port(),
                    fingerprint: fp.to_ascii_lowercase(),
                    paired: paired.contains(id),
                },
            );
        }
    }
    let _ = daemon.shutdown();
    let list: Vec<FoundPc> = found
        .into_values()
        .filter(|f| !f.hosts.is_empty())
        .collect();
    if let Ok(mut f) = FOUND.lock() {
        *f = list.clone();
    }
    list
}

// ------------------------------------------------------------------ pairing (this PC as the client)

fn emit_pair(
    app: &AppHandle,
    stage: &str,
    pc_name: &str,
    code: Option<String>,
    message: Option<&str>,
) {
    let _ = app.emit(
        "peer-pair",
        PeerPairView {
            stage: stage.into(),
            pc_name: pc_name.into(),
            code,
            message: message.map(str::to_string),
        },
    );
}

impl Link {
    pub fn peers(&self) -> Vec<Peer> {
        PEERS.lock().map(|p| p.clone()).unwrap_or_default()
    }

    /// Loads paired PCs and starts keeping them connected.
    pub fn peers_start(self: &Arc<Self>) {
        let list: Vec<Peer> = std::fs::read_to_string(peers_path(&self.app))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        if let Ok(mut p) = PEERS.lock() {
            *p = list.clone();
        }
        for peer in list {
            self.peer_supervise(peer.pc_id);
        }
    }

    /// Starts pairing with a PC from the last discovery. Progress arrives as `peer-pair` events.
    pub fn peer_pair_start(self: &Arc<Self>, pc_id: &str) -> Result<(), String> {
        let target = FOUND
            .lock()
            .ok()
            .and_then(|f| f.iter().find(|x| x.pc_id == pc_id).cloned())
            .ok_or("That PC isn't visible any more. Search again.")?;
        let (atx, arx) = mpsc::unbounded_channel::<bool>();
        if let Ok(mut a) = PAIR_ANSWER.lock() {
            *a = Some(atx);
        }
        let me = self.clone();
        tauri::async_runtime::spawn(async move {
            let result = me.run_pairing(&target, arx).await;
            if let Err(msg) = result {
                emit_pair(&me.app, "failed", &target.name, None, Some(&msg));
            }
            if let Ok(mut a) = PAIR_ANSWER.lock() {
                *a = None;
            }
        });
        Ok(())
    }

    /// The user compared the codes: `true` = they match.
    pub fn peer_pair_answer(&self, ok: bool) {
        if let Some(tx) = PAIR_ANSWER.lock().ok().and_then(|a| a.clone()) {
            let _ = tx.send(ok);
        }
    }

    async fn run_pairing(
        self: &Arc<Self>,
        t: &FoundPc,
        mut answers: mpsc::UnboundedReceiver<bool>,
    ) -> Result<(), String> {
        emit_pair(&self.app, "connecting", &t.name, None, None);
        let mut ws = None;
        let mut used_host = String::new();
        for h in &t.hosts {
            if let Ok(w) = connect(h, t.port, &t.fingerprint).await {
                ws = Some(w);
                used_host = h.clone();
                break;
            }
        }
        let mut ws = ws.ok_or_else(|| {
            format!(
                "Couldn't reach {}. Check that both PCs are on the same Wi-Fi.",
                t.name
            )
        })?;
        let hello = next_text(&mut ws, 8)
            .await
            .filter(|e| e.kind == "server.hello")
            .ok_or("The other PC didn't answer.")?;
        if hello.payload.get("pcId").and_then(Value::as_str) != Some(t.pc_id.as_str()) {
            return Err("That isn't the PC you picked.".into());
        }
        let pc_nonce = hello
            .payload
            .get("nonce")
            .and_then(Value::as_str)
            .and_then(unb64)
            .ok_or("Bad hello")?;
        let my_nonce = random_bytes::<32>();
        ws.send(Message::Text(message(
            "pair.request",
            json!({ "nonce": b64(&my_nonce), "phone": { "name": self.pc_name(), "model": PEER_MODEL } }),
        )))
        .await
        .map_err(|e| e.to_string())?;
        let code =
            sas_code(&t.fingerprint, &pc_nonce, &my_nonce).ok_or("Couldn't make the code")?;
        emit_pair(&self.app, "code", &t.name, Some(code.clone()), None);

        // Wait for: this user's answer, the other PC's decision, or a timeout.
        let deadline = Instant::now() + Duration::from_secs(180);
        let mut confirmed = false;
        loop {
            let left = deadline
                .checked_duration_since(Instant::now())
                .ok_or("Pairing took too long. Try again.")?;
            tokio::select! {
                a = answers.recv() => match a {
                    Some(true) if !confirmed => {
                        confirmed = true;
                        ws.send(Message::Text(message("pair.confirm", json!({})))).await.map_err(|e| e.to_string())?;
                        emit_pair(&self.app, "waiting", &t.name, Some(code.clone()), Some("Now press Pair on the other PC."));
                    }
                    Some(false) | None => {
                        let _ = ws.send(Message::Text(message("pair.reject", json!({ "reason": "mismatch" })))).await;
                        return Err("Pairing cancelled.".into());
                    }
                    _ => {}
                },
                m = timeout(left, ws.next()) => {
                    let Ok(Some(Ok(Message::Text(txt)))) = m else {
                        if matches!(m, Ok(Some(Ok(_)))) { continue; }
                        return Err(format!("{} closed the connection. Open “Pair a device” on it and try again.", t.name));
                    };
                    let Some(env) = parse(&txt) else { continue };
                    match env.kind.as_str() {
                        "pair.accept" => {
                            let device_id = env.payload.get("deviceId").and_then(Value::as_str).unwrap_or_default().to_string();
                            let secret = env.payload.get("secret").and_then(Value::as_str).unwrap_or_default().to_string();
                            if device_id.is_empty() || secret.is_empty() {
                                return Err("The other PC sent an incomplete pairing.".into());
                            }
                            let peer = Peer {
                                pc_id: t.pc_id.clone(),
                                name: t.name.clone(),
                                fingerprint: t.fingerprint.clone(),
                                device_id,
                                secret,
                                host: used_host.clone(),
                                port: t.port,
                                paired_at: now_secs(),
                            };
                            if let Ok(mut p) = PEERS.lock() {
                                p.retain(|x| x.pc_id != peer.pc_id);
                                p.push(peer.clone());
                            }
                            save_peers(&self.app);
                            let _ = ws.close(None).await;
                            emit_pair(&self.app, "done", &t.name, None, None);
                            self.emit_devices();
                            self.peer_supervise(peer.pc_id);
                            return Ok(());
                        }
                        "pair.reject" => {
                            let why = env.payload.get("reason").and_then(Value::as_str).unwrap_or("cancelled");
                            return Err(match why {
                                "window_closed" => format!("On {}, open PinchDrop → Devices → Pair a device first, then try again.", t.name),
                                "mismatch" => "The codes didn't match. Nothing was paired.".into(),
                                _ => "The other PC cancelled pairing.".into(),
                            });
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    /// Forgets a paired PC (and tells it, if connected).
    pub fn peer_unpair(&self, pc_id: &str) {
        let pc_id = pc_id.trim_start_matches("pc:");
        if let Some(l) = LIVE.lock().ok().and_then(|mut l| l.remove(pc_id)) {
            let _ = l.tx.send(Out::Text(message("unpair", json!({}))));
            let _ = l.tx.send(Out::Close);
        }
        if let Ok(mut p) = PEERS.lock() {
            p.retain(|x| x.pc_id != pc_id);
        }
        save_peers(&self.app);
        self.emit_devices();
    }

    /// Paired PCs as rows on the Devices screen (id = "pc:<pcId>").
    pub fn peer_device_views(&self) -> Vec<DeviceView> {
        let live: HashSet<String> = LIVE
            .lock()
            .map(|l| l.keys().cloned().collect())
            .unwrap_or_default();
        self.peers()
            .into_iter()
            .map(|p| DeviceView {
                id: format!("pc:{}", p.pc_id),
                connected: live.contains(&p.pc_id),
                name: p.name,
                model: PEER_MODEL.into(),
                paired_at: p.paired_at,
                last_seen: now_secs(),
                battery: None,
                charging: false,
                network: Some("Wi-Fi".into()),
                free_space_gb: None,
            })
            .collect()
    }

    // ------------------------------------------------------------------ staying connected

    fn peer_supervise(self: &Arc<Self>, pc_id: String) {
        if !RUNNING
            .lock()
            .map(|mut r| r.insert(pc_id.clone()))
            .unwrap_or(false)
        {
            return;
        }
        let me = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut backoff = 2u64;
            while let Some(peer) = me.peers().into_iter().find(|p| p.pc_id == pc_id) {
                let mut connected = false;
                if let Some(ws) = me.peer_connect(&peer).await {
                    connected = true;
                    me.peer_session(&peer, ws).await;
                }
                if !me.peers().iter().any(|p| p.pc_id == pc_id) {
                    break;
                }
                backoff = if connected { 2 } else { (backoff * 2).min(30) };
                tokio::time::sleep(Duration::from_secs(backoff)).await;
            }
            if let Ok(mut r) = RUNNING.lock() {
                r.remove(&pc_id);
            }
        });
    }

    /// Connects and authenticates; tries the last address, then looks the PC up again on the Wi-Fi.
    async fn peer_connect(&self, peer: &Peer) -> Option<WsStream> {
        let mut hosts = vec![peer.host.clone()];
        let mut port = peer.port;
        if let Some(f) = FOUND
            .lock()
            .ok()
            .and_then(|f| f.iter().find(|x| x.pc_id == peer.pc_id).cloned())
        {
            hosts.extend(f.hosts);
            port = f.port;
        }
        for (i, h) in hosts.iter().enumerate() {
            let p = if i == 0 { peer.port } else { port };
            let Ok(mut ws) = connect(h, p, &peer.fingerprint).await else {
                continue;
            };
            let Some(hello) = next_text(&mut ws, 8)
                .await
                .filter(|e| e.kind == "server.hello")
            else {
                continue;
            };
            let Some(nonce) = hello
                .payload
                .get("nonce")
                .and_then(Value::as_str)
                .and_then(unb64)
            else {
                continue;
            };
            let secret = unb64(&peer.secret)?;
            let proof = b64(&auth_proof(&secret, &nonce));
            if ws
                .send(Message::Text(message(
                    "auth",
                    json!({ "deviceId": peer.device_id, "proof": proof }),
                )))
                .await
                .is_err()
            {
                continue;
            }
            match next_text(&mut ws, 8).await {
                Some(e) if e.kind == "welcome" => {
                    if h != &peer.host || p != peer.port {
                        if let Ok(mut list) = PEERS.lock() {
                            if let Some(x) = list.iter_mut().find(|x| x.pc_id == peer.pc_id) {
                                x.host = h.clone();
                                x.port = p;
                            }
                        }
                        save_peers(&self.app);
                    }
                    return Some(ws);
                }
                Some(e) if e.kind == "auth.fail" => {
                    // The other PC forgot us: forget it too.
                    if e.payload.get("reason").and_then(Value::as_str) == Some("unknown_device") {
                        self.peer_unpair(&peer.pc_id);
                    }
                    return None;
                }
                _ => continue,
            }
        }
        if let Some(f) = tauri::async_runtime::spawn_blocking({
            let own = self.identity.pc_id.clone();
            move || discover(&own)
        })
        .await
        .ok()
        .and_then(|list| list.into_iter().find(|x| x.pc_id == peer.pc_id))
        {
            if let Ok(mut list) = PEERS.lock() {
                if let Some(x) = list.iter_mut().find(|x| x.pc_id == peer.pc_id) {
                    x.host = f.hosts.first().cloned().unwrap_or_default();
                    x.port = f.port;
                }
            }
        }
        None
    }

    async fn peer_session(self: &Arc<Self>, peer: &Peer, ws: WsStream) {
        let (mut sink, mut stream) = ws.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<Out>();
        let writer = tauri::async_runtime::spawn(async move {
            let mut ping = tokio::time::interval(Duration::from_secs(PING_SECS));
            ping.tick().await;
            loop {
                tokio::select! {
                    m = rx.recv() => match m {
                        Some(Out::Text(t)) => if sink.send(Message::Text(t)).await.is_err() { break },
                        Some(Out::Binary(b)) => if sink.send(Message::Binary(b)).await.is_err() { break },
                        Some(Out::Close) | None => { let _ = sink.send(Message::Close(None)).await; break }
                    },
                    _ = ping.tick() => if sink.send(Message::Ping(Vec::new())).await.is_err() { break },
                }
            }
        });
        if let Ok(mut l) = LIVE.lock() {
            l.insert(
                peer.pc_id.clone(),
                Live {
                    tx: tx.clone(),
                    name: peer.name.clone(),
                },
            );
        }
        self.emit_devices();
        let _ = tx.send(Out::Text(message("status", self_status(&self.pc_name()))));
        let mut status_tick = tokio::time::interval(Duration::from_secs(60));
        status_tick.tick().await;
        loop {
            tokio::select! {
                _ = status_tick.tick() => { let _ = tx.send(Out::Text(message("status", self_status(&self.pc_name())))); }
                m = timeout(Duration::from_secs(SILENCE_TIMEOUT_SECS), stream.next()) => {
                    let msg = match m { Ok(Some(Ok(m))) => m, _ => break };
                    match msg {
                        Message::Text(t) => {
                            let Some(env) = parse(&t) else { continue };
                            if !self.on_peer_message(peer, &tx, &env).await { break; }
                        }
                        Message::Binary(b) => {
                            if let Some((t, i, o, data)) = lift::split_frame(&b) {
                                if let Some(s) = PULLS.lock().ok().and_then(|p| p.get(&t).cloned()) {
                                    let _ = s.send((i, o, data));
                                }
                            }
                        }
                        Message::Close(_) => break,
                        _ => {}
                    }
                }
            }
        }
        if let Ok(mut l) = LIVE.lock() {
            l.remove(&peer.pc_id);
        }
        // Something it had in the air for us is gone with it.
        self.lift_device_gone(&format!("pc:{}", peer.pc_id));
        let _ = tx.send(Out::Close);
        let _ = timeout(Duration::from_secs(2), writer).await;
        self.emit_devices();
    }

    /// One message from a peer we're connected to as a client. False = stop the session.
    async fn on_peer_message(self: &Arc<Self>, peer: &Peer, tx: &Tx, env: &Envelope) -> bool {
        let p = &env.payload;
        match env.kind.as_str() {
            // A → this PC: something in the air for us. The Island and webcam show it like a lift.
            "hold.offer" => self.peer_hold_offer(&format!("pc:{}", peer.pc_id), &peer.name, p),
            "hold.cancel" => {
                let id = p.get("holdId").and_then(Value::as_str).unwrap_or_default();
                self.lift_drop_local(id);
            }
            "push.offer" => self.peer_push_offer(peer, tx, p),
            "transfer.cancel" | "transfer.error" => {
                let id = p
                    .get("transferId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                self.update_transfer(&id, |t| {
                    if t.is_active() {
                        t.state = if env.kind == "transfer.cancel" {
                            "cancelled"
                        } else {
                            "failed"
                        }
                        .into();
                        t.error = Some("Stopped on the other PC.".into());
                        t.finished_at = Some(now_secs());
                    }
                });
                self.emit_transfers(true);
            }
            // This PC → A: our lift was caught there; serve its chunks.
            "lift.catch" => {
                let id = p
                    .get("liftId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                self.peer_lift_caught(peer, &id);
            }
            "lift.req" => self.serve_lift_chunk(peer, tx, p).await,
            "lift.done" => {
                let id = p
                    .get("liftId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                if let Ok(mut o) = OUTGOING.lock() {
                    o.remove(&id);
                }
                self.update_transfer(&id, |t| {
                    t.state = "done".into();
                    t.bytes_done = t.total_bytes;
                    t.files_done = t.files.len() as u32;
                    t.finished_at = Some(now_secs());
                    t.scrub();
                });
                self.save_transfers();
                self.emit_transfers(true);
            }
            "lift.cancel" => {
                let id = p
                    .get("liftId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let reason = p.get("reason").and_then(Value::as_str).unwrap_or_default();
                if reason == "failed" || reason == "cancelled" {
                    self.update_transfer(&id, |t| {
                        if t.is_active() {
                            t.state = "failed".into();
                            t.error = Some("The other PC couldn't save it.".into());
                            t.finished_at = Some(now_secs());
                        }
                    });
                    self.emit_transfers(true);
                }
            }
            "pc.info" => {
                if let Some(n) = p.get("pcName").and_then(Value::as_str) {
                    if let Ok(mut list) = PEERS.lock() {
                        if let Some(x) = list.iter_mut().find(|x| x.pc_id == peer.pc_id) {
                            x.name = n.chars().take(40).collect();
                        }
                    }
                    save_peers(&self.app);
                    self.emit_devices();
                }
            }
            "unpair" => {
                self.peer_unpair(&peer.pc_id);
                return false;
            }
            // Phone-only requests (texts, contacts…): a PC has none of that.
            _ => {
                if let Some(id) = p.get("reqId").and_then(Value::as_str) {
                    let _ = tx.send(Out::Text(message(
                        "phone.reply",
                        json!({ "reqId": id, "ok": false, "error": "unknown" }),
                    )));
                }
            }
        }
        true
    }

    /// We caught a peer's hold on this PC: ask for it.
    pub(super) fn peer_catch_hold(&self, device: &str, hold_id: &str) -> Result<(), String> {
        let pc_id = device.trim_start_matches("pc:");
        let tx = LIVE
            .lock()
            .ok()
            .and_then(|l| l.get(pc_id).map(|x| x.tx.clone()))
            .ok_or("That PC isn't connected any more.")?;
        if let Ok(mut c) = CAUGHT.lock() {
            c.insert(hold_id.to_string());
        }
        let _ = tx.send(Out::Text(message(
            "hold.catch",
            json!({ "holdId": hold_id }),
        )));
        Ok(())
    }

    /// The other PC sends files: accept (always for a hold we caught; PCs you paired are trusted)
    /// and pull them into Downloads\PinchDrop, keeping their folders.
    fn peer_push_offer(self: &Arc<Self>, peer: &Peer, tx: &Tx, p: &Value) {
        let id = p
            .get("transferId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if id.is_empty() {
            return;
        }
        if let Some(h) = p.get("holdId").and_then(Value::as_str) {
            if let Ok(mut c) = CAUGHT.lock() {
                c.remove(h);
            }
        }
        let files: Vec<(Vec<String>, u64)> = p
            .get("files")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|f| {
                        let segs = lift::safe_rel_path(f.get("path").and_then(Value::as_str)?);
                        (!segs.is_empty())
                            .then(|| (segs, f.get("size").and_then(Value::as_u64).unwrap_or(0)))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let texts: Vec<String> = p
            .get("texts")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        let _ = tx.send(Out::Text(message(
            "push.accept",
            json!({ "transferId": id }),
        )));
        let dir = lift::save_dir(&self.app);
        if !texts.is_empty() {
            lift::land_texts_pub(&self.app, &dir, &texts);
        }
        if files.is_empty() {
            let _ = tx.send(Out::Text(message(
                "transfer.complete",
                json!({ "transferId": id }),
            )));
            return;
        }
        let label = p
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or("Files")
            .chars()
            .take(120)
            .collect::<String>();
        let total: u64 = files.iter().map(|f| f.1).sum();
        if let Ok(mut ts) = self.transfers.lock() {
            ts.push(Transfer {
                id: id.clone(),
                device_id: format!("pc:{}", peer.pc_id),
                device_name: peer.name.clone(),
                label,
                created_at: now_secs(),
                finished_at: None,
                state: "sending".into(),
                error: None,
                mode: "copy".into(),
                destination: String::new(),
                open_first: false,
                files: files
                    .iter()
                    .map(|(segs, size)| transfer::FileEntry {
                        path: segs.join("/"),
                        source: String::new(),
                        size: *size,
                    })
                    .collect(),
                texts: Vec::new(),
                roots: Vec::new(),
                hold_id: None,
                total_bytes: total,
                files_done: 0,
                bytes_done: 0,
                moved: false,
                direction: "in".into(),
            });
        }
        self.save_transfers();
        self.emit_transfers(true);
        let (ctx, crx) = mpsc::unbounded_channel();
        if let Ok(mut pl) = PULLS.lock() {
            pl.insert(id.clone(), ctx);
        }
        let me = self.clone();
        let tx = tx.clone();
        tauri::async_runtime::spawn(async move {
            let req_tx = tx.clone();
            let rid = id.clone();
            let result = me
                .pull_into(
                    &id,
                    &files,
                    &dir,
                    crx,
                    CHUNK_MAX,
                    move |index, offset, length| {
                        req_tx
                            .send(Out::Text(message(
                                "chunk.req",
                                json!({ "transferId": rid, "index": index, "offset": offset, "length": length }),
                            )))
                            .is_ok()
                    },
                    |index| {
                        let _ = tx.send(Out::Text(message("file.done", json!({ "transferId": id, "index": index }))));
                    },
                )
                .await;
            if let Ok(mut pl) = PULLS.lock() {
                pl.remove(&id);
            }
            match result {
                Ok(saved) => {
                    let _ = tx.send(Out::Text(message(
                        "transfer.complete",
                        json!({ "transferId": id }),
                    )));
                    me.update_transfer(&id, |t| {
                        t.state = "done".into();
                        t.bytes_done = t.total_bytes;
                        t.files_done = t.files.len() as u32;
                        t.finished_at = Some(now_secs());
                    });
                    lift::open_landed_pub(&me.app, &dir, &saved);
                }
                Err(reason) => {
                    let _ = tx.send(Out::Text(message(
                        "transfer.cancel",
                        json!({ "transferId": id }),
                    )));
                    me.update_transfer(&id, |t| {
                        if t.is_active() {
                            t.state = "failed".into();
                            t.error = Some(reason);
                            t.finished_at = Some(now_secs());
                        }
                    });
                }
            }
            me.save_transfers();
            me.emit_transfers(true);
        });
    }

    // ------------------------------------------------------------------ this PC → a peer (as a lift)

    /// Something was put in the air here: offer it to every connected peer PC too.
    /// Returns the names of the PCs it was offered to.
    pub fn peers_offer_lift(
        &self,
        hold_id: &str,
        items: &crate::grab::GrabbedItems,
        secs: u64,
    ) -> Vec<String> {
        let live: Vec<(String, Tx, String)> = LIVE
            .lock()
            .map(|l| {
                l.iter()
                    .map(|(id, x)| (id.clone(), x.tx.clone(), x.name.clone()))
                    .collect()
            })
            .unwrap_or_default();
        if live.is_empty() {
            return Vec::new();
        }
        let Ok((files, _)) = transfer::build_manifest(&items.paths) else {
            return Vec::new();
        };
        let mut names = Vec::new();
        for (pc_id, tx, name) in live {
            if self.offer_lift_to(&pc_id, &tx, hold_id, items, &files, secs, false) {
                names.push(name);
            }
        }
        names
    }

    /// Send straight to one peer (a device chip, or the Send screen): a lift that's caught at once.
    pub async fn peer_send_now(
        &self,
        device: &str,
        paths: Vec<String>,
        texts: Vec<String>,
        label: Option<String>,
    ) -> Result<String, String> {
        let pc_id = device.trim_start_matches("pc:").to_string();
        let (tx, name) = LIVE
            .lock()
            .ok()
            .and_then(|l| l.get(&pc_id).map(|x| (x.tx.clone(), x.name.clone())))
            .ok_or("That PC isn't connected right now.")?;
        let p2 = paths.clone();
        let (files, auto_label) =
            tauri::async_runtime::spawn_blocking(move || transfer::build_manifest(&p2))
                .await
                .map_err(|e| e.to_string())??;
        if files.is_empty() && texts.is_empty() {
            return Err("Nothing to send.".into());
        }
        let items = crate::grab::GrabbedItems {
            preview: crate::preview::for_paths(&paths),
            paths,
            texts,
            open_on_arrival: true,
            label: label.unwrap_or(auto_label),
            file_count: files.len() as u64,
            total_bytes: files.iter().map(|f| f.size).sum(),
            is_folder: false,
            partial: false,
        };
        let id = random_id();
        self.offer_lift_to(&pc_id, &tx, &id, &items, &files, 30, true);
        Ok(format!("Sending to {name}"))
    }

    #[allow(clippy::too_many_arguments)]
    fn offer_lift_to(
        &self,
        pc_id: &str,
        tx: &Tx,
        lift_id: &str,
        items: &crate::grab::GrabbedItems,
        files: &[transfer::FileEntry],
        secs: u64,
        send_now: bool,
    ) -> bool {
        if let Ok(mut o) = OUTGOING.lock() {
            o.insert(
                lift_id.to_string(),
                Outgoing {
                    pc_id: pc_id.to_string(),
                    files: files.to_vec(),
                },
            );
        }
        let list: Vec<Value> = files
            .iter()
            .enumerate()
            .map(|(i, f)| json!({ "index": i, "name": f.path, "size": f.size, "mime": "" }))
            .collect();
        let thumb = items.preview.thumb.clone().filter(|t| t.len() <= 90 * 1024);
        tx.send(Out::Text(message(
            "lift.offer",
            json!({
                "liftId": lift_id, "label": items.label, "totalBytes": files.iter().map(|f| f.size).sum::<u64>(),
                "expiresInSecs": secs, "files": list, "texts": items.texts, "thumb": thumb, "sendNow": send_now
            }),
        )))
        .is_ok()
    }

    /// Tells peers a lift is off (caught here by a phone, expired, or cancelled).
    pub fn peers_cancel_lift(&self, lift_id: &str, reason: &str) {
        let Some(o) = OUTGOING.lock().ok().and_then(|mut o| o.remove(lift_id)) else {
            return;
        };
        if let Some(tx) = LIVE
            .lock()
            .ok()
            .and_then(|l| l.get(&o.pc_id).map(|x| x.tx.clone()))
        {
            let _ = tx.send(Out::Text(message(
                "lift.cancel",
                json!({ "liftId": lift_id, "reason": reason }),
            )));
        }
    }

    /// A peer caught our lift: end the hold here (phones stop waiting) and track the send.
    fn peer_lift_caught(&self, peer: &Peer, id: &str) {
        let Some(files) = OUTGOING
            .lock()
            .ok()
            .and_then(|o| o.get(id).map(|x| x.files.clone()))
        else {
            return;
        };
        // Other lifts of the same hold to other PCs are off.
        if let Ok(o) = OUTGOING.lock() {
            for (lid, out) in o.iter() {
                if lid == id && out.pc_id != peer.pc_id {
                    // (one entry per lift id; nothing else to do)
                }
            }
        }
        if let Some(g) = self.app.try_state::<crate::grab::Grab>() {
            g.hold_taken_elsewhere(&self.app, id);
        }
        let label = files
            .first()
            .map(|f| f.path.split('/').next().unwrap_or(&f.path).to_string())
            .unwrap_or_else(|| "Note".into());
        if let Ok(mut ts) = self.transfers.lock() {
            if !ts.iter().any(|t| t.id == id) {
                ts.push(Transfer {
                    id: id.to_string(),
                    device_id: format!("pc:{}", peer.pc_id),
                    device_name: peer.name.clone(),
                    label: if files.len() > 1 && files.iter().all(|f| f.path.contains('/')) {
                        label
                    } else {
                        files
                            .first()
                            .map(|f| f.path.rsplit('/').next().unwrap_or(&f.path).to_string())
                            .unwrap_or(label)
                    },
                    created_at: now_secs(),
                    finished_at: None,
                    state: "sending".into(),
                    error: None,
                    mode: "copy".into(),
                    destination: String::new(),
                    open_first: false,
                    total_bytes: files.iter().map(|f| f.size).sum(),
                    files,
                    texts: Vec::new(),
                    roots: Vec::new(),
                    hold_id: None,
                    files_done: 0,
                    bytes_done: 0,
                    moved: false,
                    direction: "out".into(),
                });
            }
        }
        self.save_transfers();
        self.emit_transfers(true);
    }

    /// `lift.req` from a peer: one chunk of a file in our lift (never anything else).
    async fn serve_lift_chunk(&self, peer: &Peer, tx: &Tx, p: &Value) {
        let id = p
            .get("liftId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let index = p.get("index").and_then(Value::as_u64).unwrap_or(u64::MAX) as usize;
        let offset = p.get("offset").and_then(Value::as_u64).unwrap_or(0);
        let length = p
            .get("length")
            .and_then(Value::as_u64)
            .unwrap_or(transfer::LIFT_CHUNK)
            .min(CHUNK_MAX);
        let file = OUTGOING.lock().ok().and_then(|o| {
            o.get(&id)
                .filter(|x| x.pc_id == peer.pc_id)
                .and_then(|x| x.files.get(index).cloned())
        });
        let Some(file) = file else {
            let _ = tx.send(Out::Text(message(
                "lift.cancel",
                json!({ "liftId": id, "reason": "unreadable" }),
            )));
            return;
        };
        let read = tauri::async_runtime::spawn_blocking(move || -> Option<Vec<u8>> {
            use std::io::{Read, Seek, SeekFrom};
            let mut f = std::fs::File::open(&file.source).ok()?;
            if offset > file.size {
                return None;
            }
            f.seek(SeekFrom::Start(offset)).ok()?;
            let mut buf = vec![0u8; length.min(file.size - offset) as usize];
            f.read_exact(&mut buf).ok()?;
            Some(buf)
        })
        .await
        .ok()
        .flatten();
        let Some(data) = read else {
            let _ = tx.send(Out::Text(message(
                "lift.cancel",
                json!({ "liftId": id, "reason": "unreadable" }),
            )));
            return;
        };
        let header = json!({ "t": id, "i": index, "o": offset })
            .to_string()
            .into_bytes();
        let mut frame = Vec::with_capacity(4 + header.len() + data.len());
        frame.extend_from_slice(&(header.len() as u32).to_be_bytes());
        frame.extend_from_slice(&header);
        frame.extend_from_slice(&data);
        let n = data.len() as u64;
        let _ = tx.send(Out::Binary(frame));
        self.update_transfer(&id, |t| {
            t.bytes_done = (t.bytes_before(index) + offset + n).min(t.total_bytes);
        });
        self.emit_transfers(false);
    }
}

/// What this PC tells a peer about itself (battery if it's a laptop).
fn self_status(name: &str) -> Value {
    let (battery, charging) = laptop_battery();
    json!({ "name": name, "model": PEER_MODEL, "battery": battery, "charging": charging, "network": "Wi-Fi" })
}

#[cfg(windows)]
fn laptop_battery() -> (Option<u8>, bool) {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s = SYSTEM_POWER_STATUS::default();
    // SAFETY: fills the struct.
    if unsafe { GetSystemPowerStatus(&mut s) }.is_err() || s.BatteryLifePercent > 100 {
        return (None, false);
    }
    (Some(s.BatteryLifePercent), s.ACLineStatus == 1)
}

#[cfg(not(windows))]
fn laptop_battery() -> (Option<u8>, bool) {
    (None, false)
}
