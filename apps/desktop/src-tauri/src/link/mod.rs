//! Phase 3: the encrypted PC ↔ phone link (spec: packages/protocol/LINK-v1.md).
//!
//! The PC listens for `wss://…/link`, advertises itself over mDNS, pairs new
//! phones (QR or 6-digit code) and keeps a session per connected phone so the
//! pill can show its real name and battery.

pub mod proto;
pub mod store;
pub mod transfer;

use crate::phone::PhoneStatus;
use futures_util::{SinkExt, StreamExt};
use proto::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use store::{Devices, Identity, PairedDevice};
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio::time::timeout;
use tokio_rustls::TlsAcceptor;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::Message;
use transfer::{Transfer, TransferView, CHUNK_MAX, HISTORY_MAX};

enum Out {
    Text(String),
    Binary(Vec<u8>),
    Close,
}

type Tx = mpsc::UnboundedSender<Out>;
type AuthSlot = Arc<Mutex<Option<String>>>;

/// What the phone tells us about itself (`status` payload).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct PhoneReport {
    pub name: Option<String>,
    pub model: Option<String>,
    pub battery: Option<u8>,
    pub charging: bool,
    pub network: Option<String>,
    pub free_space_gb: Option<u32>,
}

struct PendingPair {
    conn_id: u64,
    phone_name: String,
    phone_model: String,
    code: String,
    phone_confirmed: bool,
    pc_confirmed: bool,
    tx: Tx,
    authed: AuthSlot,
}

struct PairWindow {
    token: String,
    opened: Instant,
    pending: Option<PendingPair>,
}

impl PairWindow {
    fn expired(&self) -> bool {
        self.opened.elapsed() > Duration::from_secs(PAIR_WINDOW_SECS)
    }
}

struct Session {
    conn_id: u64,
    tx: Tx,
    report: PhoneReport,
    since: Instant,
}

/// Shown on the PC's Pair screen.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairInfo {
    pub url: String,
    pub qr_svg_data_url: String,
    pub pc_name: String,
    pub hosts: Vec<String>,
    pub port: Option<u16>,
    pub fingerprint: String,
    pub expires_in_secs: u64,
    pub listen_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequestView {
    pub phone_name: String,
    pub phone_model: String,
    pub code: String,
    pub phone_confirmed: bool,
    pub pc_confirmed: bool,
}

/// One row on the Devices screen.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceView {
    pub id: String,
    pub name: String,
    pub model: String,
    pub paired_at: u64,
    pub last_seen: u64,
    pub connected: bool,
    pub battery: Option<u8>,
    pub charging: bool,
    pub network: Option<String>,
    pub free_space_gb: Option<u32>,
}

pub struct Link {
    app: AppHandle,
    pub identity: Identity,
    devices_path: PathBuf,
    devices: Mutex<Devices>,
    port: Mutex<Option<u16>>,
    listen_error: Mutex<Option<String>>,
    pairing: Mutex<Option<PairWindow>>,
    sessions: Mutex<HashMap<String, Session>>,
    next_conn: AtomicU64,
    mdns: Mutex<Option<mdns_sd::ServiceDaemon>>,
    transfers: Mutex<Vec<Transfer>>,
    transfers_path: PathBuf,
    last_progress_emit: Mutex<Instant>,
}

/// Local IPv4 addresses the phone could reach, home-network ranges first.
pub fn lan_hosts() -> Vec<String> {
    let mut v4: Vec<std::net::Ipv4Addr> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|i| !i.is_loopback())
        .filter_map(|i| match i.ip() {
            IpAddr::V4(a) if !a.is_link_local() && !a.is_unspecified() => Some(a),
            _ => None,
        })
        .collect();
    let rank = |a: &std::net::Ipv4Addr| match a.octets() {
        [192, 168, ..] => 0,
        [10, ..] => 1,
        [172, b, ..] if (16..=31).contains(&b) => 2,
        _ => 3,
    };
    v4.sort_by_key(rank);
    v4.dedup();
    v4.into_iter().map(|a| a.to_string()).collect()
}

fn qr_data_url(text: &str) -> String {
    match qrcode::QrCode::new(text.as_bytes()) {
        Ok(code) => {
            let svg = code
                .render::<qrcode::render::svg::Color>()
                .min_dimensions(240, 240)
                .quiet_zone(true)
                .dark_color(qrcode::render::svg::Color("#0B1020"))
                .light_color(qrcode::render::svg::Color("#FFFFFF"))
                .build();
            format!("data:image/svg+xml;base64,{}", b64(svg.as_bytes()))
        }
        Err(_) => String::new(),
    }
}

fn tls_acceptor(id: &Identity) -> Result<TlsAcceptor, String> {
    use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = rustls::ServerConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .with_no_client_auth()
        .with_single_cert(
            vec![CertificateDer::from(id.cert_der.clone())],
            PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(id.key_der.clone())),
        )
        .map_err(|e| e.to_string())?;
    Ok(TlsAcceptor::from(Arc::new(config)))
}

impl Link {
    pub fn new(app: AppHandle, config_dir: &Path) -> Result<Arc<Self>, String> {
        let identity = store::load_or_create_identity(config_dir)?;
        let devices_path = store::devices_path(config_dir);
        let devices = Devices::load(&devices_path);
        let transfers_path = config_dir.join("transfers.json");
        let mut transfers: Vec<Transfer> = std::fs::read_to_string(&transfers_path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        // Anything that was moving when the app closed waits for the phone to resume it.
        for t in transfers.iter_mut().filter(|t| t.state == "sending") {
            t.state = "paused".into();
        }
        Ok(Arc::new(Self {
            app,
            identity,
            devices_path,
            devices: Mutex::new(devices),
            port: Mutex::new(None),
            listen_error: Mutex::new(None),
            pairing: Mutex::new(None),
            sessions: Mutex::new(HashMap::new()),
            next_conn: AtomicU64::new(1),
            mdns: Mutex::new(None),
            transfers: Mutex::new(transfers),
            transfers_path,
            last_progress_emit: Mutex::new(Instant::now()),
        }))
    }

    fn pc_name(&self) -> String {
        crate::current_pc_name(&self.app)
    }

    // ------------------------------------------------------------ server

    /// Binds the listener (default port, else any free one), advertises over mDNS and accepts phones.
    pub fn start(self: &Arc<Self>) {
        let link = self.clone();
        tauri::async_runtime::spawn(async move {
            let acceptor = match tls_acceptor(&link.identity) {
                Ok(a) => a,
                Err(e) => {
                    link.set_listen_error(format!("TLS setup failed: {e}"));
                    return;
                }
            };
            let listener = match TcpListener::bind(("0.0.0.0", DEFAULT_PORT)).await {
                Ok(l) => l,
                Err(_) => match TcpListener::bind(("0.0.0.0", 0)).await {
                    Ok(l) => l,
                    Err(e) => {
                        link.set_listen_error(format!("Couldn't open a network port: {e}"));
                        return;
                    }
                },
            };
            let port = listener
                .local_addr()
                .map(|a| a.port())
                .unwrap_or(DEFAULT_PORT);
            if let Ok(mut p) = link.port.lock() {
                *p = Some(port);
            }
            link.advertise();
            loop {
                match listener.accept().await {
                    Ok((tcp, _addr)) => {
                        let _ = tcp.set_nodelay(true);
                        let l = link.clone();
                        let acc = acceptor.clone();
                        tauri::async_runtime::spawn(async move { l.handle_conn(tcp, acc).await });
                    }
                    Err(_) => tokio::time::sleep(Duration::from_millis(200)).await,
                }
            }
        });
    }

    fn set_listen_error(&self, e: String) {
        if let Ok(mut g) = self.listen_error.lock() {
            *g = Some(e);
        }
    }

    /// (Re-)registers the mDNS service so phones on the Wi-Fi can find this PC.
    pub fn advertise(&self) {
        let Some(port) = self.port.lock().ok().and_then(|p| *p) else {
            return;
        };
        let Ok(mut slot) = self.mdns.lock() else {
            return;
        };
        if let Some(old) = slot.take() {
            let _ = old.shutdown();
        }
        let Ok(daemon) = mdns_sd::ServiceDaemon::new() else {
            return;
        };
        let id = &self.identity.pc_id;
        let name = self.pc_name();
        let clean: String = name
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == ' ')
            .take(40)
            .collect();
        let instance = format!("{} {}", clean.trim(), &id[..6]);
        let host = format!("pinchdrop-{}.local.", &id[..8]);
        let mut props = HashMap::new();
        props.insert("id".to_string(), id.clone());
        props.insert("v".to_string(), PROTOCOL_VERSION.to_string());
        props.insert("fp".to_string(), self.identity.fingerprint.clone());
        props.insert("name".to_string(), name);
        let ips = lan_hosts().join(",");
        if let Ok(info) =
            mdns_sd::ServiceInfo::new(MDNS_SERVICE, &instance, &host, ips.as_str(), port, props)
        {
            let _ = daemon.register(info.enable_addr_auto());
            *slot = Some(daemon);
        }
    }

    async fn handle_conn(self: Arc<Self>, tcp: TcpStream, acceptor: TlsAcceptor) {
        let Ok(Ok(tls)) = timeout(Duration::from_secs(10), acceptor.accept(tcp)).await else {
            return;
        };
        #[allow(clippy::result_large_err)]
        let check_path = |req: &Request, resp: Response| -> Result<Response, ErrorResponse> {
            if req.uri().path() == WS_PATH {
                Ok(resp)
            } else {
                let mut r = ErrorResponse::new(Some("not found".into()));
                *r.status_mut() = StatusCode::NOT_FOUND;
                Err(r)
            }
        };
        let Ok(Ok(ws)) = timeout(
            Duration::from_secs(10),
            tokio_tungstenite::accept_hdr_async(tls, check_path),
        )
        .await
        else {
            return;
        };
        let (mut sink, mut stream) = ws.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<Out>();
        let conn_id = self.next_conn.fetch_add(1, Ordering::Relaxed);
        let pc_nonce = random_bytes::<32>();
        let authed: AuthSlot = Arc::new(Mutex::new(None));

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

        let _ = tx.send(Out::Text(message(
            "server.hello",
            json!({ "pcId": self.identity.pc_id, "pcName": self.pc_name(), "nonce": b64(&pc_nonce) }),
        )));

        loop {
            let next = timeout(Duration::from_secs(SILENCE_TIMEOUT_SECS), stream.next()).await;
            let msg = match next {
                Ok(Some(Ok(m))) => m,
                _ => break,
            };
            let text = match msg {
                Message::Text(t) => t,
                Message::Close(_) => break,
                _ => continue, // pings/pongs keep the timeout fresh
            };
            let Some(env) = parse(&text) else { continue };
            let device = authed.lock().ok().and_then(|g| g.clone());
            match (device, env.kind.as_str()) {
                (None, "pair.request") => {
                    self.on_pair_request(conn_id, &env.payload, &pc_nonce, &tx, &authed)
                }
                (None, "pair.confirm") => self.on_phone_confirm(conn_id),
                (None, "pair.reject") => {
                    self.on_phone_reject(conn_id);
                    break;
                }
                (None, "auth") => {
                    if !self.on_auth(conn_id, &env.payload, &pc_nonce, &tx, &authed) {
                        break;
                    }
                }
                (Some(dev), "status") => self.on_status(&dev, conn_id, &env.payload),
                // Served in order, one at a time, so chunks reach the phone in the order it asked.
                (Some(dev), "chunk.req") => self.serve_chunk(&dev, &tx, &env.payload).await,
                (Some(_), "hold.catch") => {
                    // The phone caught a held item (P6): send it for real.
                    let hold_id = env
                        .payload
                        .get("holdId")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let app = self.app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(g) = app.try_state::<crate::grab::Grab>() {
                            let _ = g.hold_deliver(&app, Some(&hold_id)).await;
                        }
                    });
                }
                (
                    Some(dev),
                    kind @ ("push.accept" | "push.decline" | "file.done" | "transfer.complete"
                    | "transfer.cancel"),
                ) => self.on_transfer_msg(&dev, kind, &env.payload),
                (Some(dev), "unpair") => {
                    self.forget(&dev, false);
                    break;
                }
                _ => {}
            }
        }

        let device = authed.lock().ok().and_then(|g| g.clone());
        self.on_disconnect(conn_id, device);
        let _ = tx.send(Out::Close);
        let _ = timeout(Duration::from_secs(2), writer).await;
    }

    // ------------------------------------------------------------ pairing

    /// Opens (or keeps open) the pairing window and returns what the Pair screen shows.
    pub fn pairing_open(&self) -> PairInfo {
        let token = {
            let mut g = self.pairing.lock().unwrap_or_else(|p| p.into_inner());
            match g.as_ref() {
                Some(w) if !w.expired() => w.token.clone(),
                _ => {
                    let t = b64url(&random_bytes::<16>());
                    *g = Some(PairWindow {
                        token: t.clone(),
                        opened: Instant::now(),
                        pending: None,
                    });
                    t
                }
            }
        };
        let remaining = self
            .pairing
            .lock()
            .ok()
            .and_then(|g| {
                g.as_ref()
                    .map(|w| PAIR_WINDOW_SECS.saturating_sub(w.opened.elapsed().as_secs()))
            })
            .unwrap_or(0);
        let hosts = lan_hosts();
        let port = self.port.lock().ok().and_then(|p| *p);
        let pc_name = self.pc_name();
        let url = pairing_url(
            &self.identity.pc_id,
            &pc_name,
            &hosts,
            port.unwrap_or(DEFAULT_PORT),
            &self.identity.fingerprint,
            &token,
        );
        PairInfo {
            qr_svg_data_url: qr_data_url(&url),
            url,
            pc_name,
            hosts,
            port,
            fingerprint: self.identity.fingerprint.clone(),
            expires_in_secs: remaining,
            listen_error: self.listen_error.lock().ok().and_then(|g| g.clone()),
        }
    }

    /// Closes the pairing window (Pair screen left). A phone mid-pairing is told why.
    pub fn pairing_close(&self) {
        let taken = self.pairing.lock().ok().and_then(|mut g| g.take());
        if let Some(PendingPair { tx, .. }) = taken.and_then(|w| w.pending) {
            let _ = tx.send(Out::Text(message(
                "pair.reject",
                json!({ "reason": "window_closed" }),
            )));
            let _ = tx.send(Out::Close);
        }
        self.emit_pair_request();
    }

    pub fn pair_request_view(&self) -> Option<PairRequestView> {
        let g = self.pairing.lock().ok()?;
        let p = g.as_ref()?.pending.as_ref()?;
        Some(PairRequestView {
            phone_name: p.phone_name.clone(),
            phone_model: p.phone_model.clone(),
            code: p.code.clone(),
            phone_confirmed: p.phone_confirmed,
            pc_confirmed: p.pc_confirmed,
        })
    }

    fn emit_pair_request(&self) {
        let _ = self.app.emit("pair-request", self.pair_request_view());
    }

    fn emit_pair_result(&self, outcome: &str, phone_name: &str) {
        let _ = self.app.emit(
            "pair-result",
            json!({ "outcome": outcome, "phoneName": phone_name }),
        );
    }

    fn on_pair_request(
        &self,
        conn_id: u64,
        p: &Value,
        pc_nonce: &[u8],
        tx: &Tx,
        authed: &AuthSlot,
    ) {
        let reject = |reason: &str| {
            let _ = tx.send(Out::Text(message(
                "pair.reject",
                json!({ "reason": reason }),
            )));
            let _ = tx.send(Out::Close);
        };
        let phone_nonce = match p.get("nonce").and_then(Value::as_str).and_then(unb64) {
            Some(n) if n.len() == 32 => n,
            _ => return reject("cancelled"),
        };
        let name: String = p
            .pointer("/phone/name")
            .and_then(Value::as_str)
            .unwrap_or("Android phone")
            .chars()
            .take(40)
            .collect();
        let model: String = p
            .pointer("/phone/model")
            .and_then(Value::as_str)
            .unwrap_or("")
            .chars()
            .take(60)
            .collect();
        let Some(code) = sas_code(&self.identity.fingerprint, pc_nonce, &phone_nonce) else {
            return reject("cancelled");
        };
        {
            let mut g = self.pairing.lock().unwrap_or_else(|e| e.into_inner());
            let Some(w) = g.as_mut().filter(|w| !w.expired()) else {
                drop(g);
                return reject("window_closed");
            };
            if let Some(t) = p.get("token").and_then(Value::as_str) {
                if t != w.token {
                    drop(g);
                    return reject("bad_token");
                }
            }
            if let Some(old) = w.pending.take() {
                // Another phone was mid-pairing; only one at a time.
                let _ = old.tx.send(Out::Text(message(
                    "pair.reject",
                    json!({ "reason": "cancelled" }),
                )));
                let _ = old.tx.send(Out::Close);
            }
            w.pending = Some(PendingPair {
                conn_id,
                phone_name: name,
                phone_model: model,
                code,
                phone_confirmed: false,
                pc_confirmed: false,
                tx: tx.clone(),
                authed: authed.clone(),
            });
        }
        self.emit_pair_request();
        crate::show_main_route(&self.app, "pair");
    }

    fn on_phone_confirm(&self, conn_id: u64) {
        if let Ok(mut g) = self.pairing.lock() {
            if let Some(p) = g
                .as_mut()
                .and_then(|w| w.pending.as_mut())
                .filter(|p| p.conn_id == conn_id)
            {
                p.phone_confirmed = true;
            }
        }
        self.emit_pair_request();
        self.try_finish_pair();
    }

    fn on_phone_reject(&self, conn_id: u64) {
        let name = self.take_pending_if(conn_id);
        if let Some(n) = name {
            self.emit_pair_request();
            self.emit_pair_result("mismatch", &n);
        }
    }

    /// Removes the pending request if it belongs to `conn_id`; returns the phone name.
    fn take_pending_if(&self, conn_id: u64) -> Option<String> {
        let mut g = self.pairing.lock().ok()?;
        let w = g.as_mut()?;
        if w.pending.as_ref().map(|p| p.conn_id) == Some(conn_id) {
            w.pending.take().map(|p| p.phone_name)
        } else {
            None
        }
    }

    /// The PC user pressed Pair (accept) or Cancel on the code screen.
    pub fn pairing_respond(&self, accept: bool) {
        if !accept {
            let pending = self
                .pairing
                .lock()
                .ok()
                .and_then(|mut g| g.as_mut().and_then(|w| w.pending.take()));
            if let Some(p) = pending {
                let _ = p.tx.send(Out::Text(message(
                    "pair.reject",
                    json!({ "reason": "cancelled" }),
                )));
                let _ = p.tx.send(Out::Close);
                self.emit_pair_request();
                self.emit_pair_result("cancelled", &p.phone_name);
            }
            return;
        }
        if let Ok(mut g) = self.pairing.lock() {
            if let Some(p) = g.as_mut().and_then(|w| w.pending.as_mut()) {
                p.pc_confirmed = true;
            }
        }
        self.emit_pair_request();
        self.try_finish_pair();
    }

    fn try_finish_pair(&self) {
        let done = {
            let mut g = self.pairing.lock().unwrap_or_else(|e| e.into_inner());
            let ready = g
                .as_ref()
                .and_then(|w| w.pending.as_ref())
                .map(|p| p.phone_confirmed && p.pc_confirmed)
                .unwrap_or(false);
            if ready {
                // Pairing done: close the window so the QR can't be reused.
                g.take().and_then(|w| w.pending)
            } else {
                None
            }
        };
        let Some(p) = done else { return };
        let device = PairedDevice::new(&p.phone_name, &p.phone_model, now_secs());
        {
            let mut ds = self.devices.lock().unwrap_or_else(|e| e.into_inner());
            ds.add(device.clone());
            let _ = ds.save(&self.devices_path);
        }
        let _ = p.tx.send(Out::Text(message(
            "pair.accept",
            json!({ "deviceId": device.id, "secret": device.secret, "pcName": self.pc_name() }),
        )));
        if let Ok(mut a) = p.authed.lock() {
            *a = Some(device.id.clone());
        }
        if let Ok(mut s) = self.sessions.lock() {
            s.insert(
                device.id.clone(),
                Session {
                    conn_id: p.conn_id,
                    tx: p.tx.clone(),
                    report: PhoneReport {
                        name: Some(p.phone_name.clone()),
                        model: Some(p.phone_model.clone()),
                        ..Default::default()
                    },
                    since: Instant::now(),
                },
            );
        }
        self.emit_pair_request();
        self.emit_pair_result("paired", &p.phone_name);
        self.emit_devices();
    }

    // ------------------------------------------------------------ sessions

    fn on_auth(
        &self,
        conn_id: u64,
        p: &Value,
        pc_nonce: &[u8],
        tx: &Tx,
        authed: &AuthSlot,
    ) -> bool {
        let device_id = p
            .get("deviceId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let proof = p
            .get("proof")
            .and_then(Value::as_str)
            .and_then(unb64)
            .unwrap_or_default();
        let device = self
            .devices
            .lock()
            .ok()
            .and_then(|d| d.get(&device_id).cloned());
        let Some(device) = device else {
            let _ = tx.send(Out::Text(message(
                "auth.fail",
                json!({ "reason": "unknown_device" }),
            )));
            return false;
        };
        if !verify_proof(&device.secret_bytes(), pc_nonce, &proof) {
            let _ = tx.send(Out::Text(message(
                "auth.fail",
                json!({ "reason": "bad_proof" }),
            )));
            return false;
        }
        if let Ok(mut a) = authed.lock() {
            *a = Some(device.id.clone());
        }
        let old = self.sessions.lock().ok().and_then(|mut s| {
            s.insert(
                device.id.clone(),
                Session {
                    conn_id,
                    tx: tx.clone(),
                    report: PhoneReport {
                        name: Some(device.name.clone()),
                        model: Some(device.model.clone()),
                        ..Default::default()
                    },
                    since: Instant::now(),
                },
            )
        });
        if let Some(old) = old {
            // The phone reconnected before the old link timed out; drop the stale one.
            let _ = old.tx.send(Out::Close);
        }
        let _ = tx.send(Out::Text(message(
            "welcome",
            json!({ "pcName": self.pc_name() }),
        )));
        // Offers the phone never answered (it was away) are sent again.
        let pending: Vec<String> = self
            .transfers
            .lock()
            .map(|ts| {
                ts.iter()
                    .filter(|t| t.device_id == device.id && t.state == "offered")
                    .map(offer_message)
                    .collect()
            })
            .unwrap_or_default();
        for m in pending {
            let _ = tx.send(Out::Text(m));
        }
        if let Ok(mut ds) = self.devices.lock() {
            ds.touch(&device.id, None, None, now_secs());
        }
        self.emit_devices();
        true
    }

    fn on_status(&self, device_id: &str, conn_id: u64, p: &Value) {
        let Ok(report) = serde_json::from_value::<PhoneReport>(p.clone()) else {
            return;
        };
        let report = PhoneReport {
            battery: report.battery.map(|b| b.min(100)),
            name: report.name.map(|n| n.chars().take(40).collect()),
            model: report.model.map(|m| m.chars().take(60).collect()),
            network: report.network.map(|n| n.chars().take(40).collect()),
            ..report
        };
        if let Ok(mut s) = self.sessions.lock() {
            match s.get_mut(device_id) {
                Some(sess) if sess.conn_id == conn_id => sess.report = report.clone(),
                _ => return,
            }
        }
        if let Ok(mut ds) = self.devices.lock() {
            let before = ds.get(device_id).map(|d| (d.name.clone(), d.model.clone()));
            ds.touch(
                device_id,
                report.name.as_deref(),
                report.model.as_deref(),
                now_secs(),
            );
            let after = ds.get(device_id).map(|d| (d.name.clone(), d.model.clone()));
            if before != after {
                let _ = ds.save(&self.devices_path);
            }
        }
        self.emit_devices();
    }

    fn on_disconnect(&self, conn_id: u64, device: Option<String>) {
        if let Some(name) = self.take_pending_if(conn_id) {
            self.emit_pair_request();
            self.emit_pair_result("phone_left", &name);
        }
        let Some(dev) = device else { return };
        self.pause_transfers_of(&dev);
        let removed = self
            .sessions
            .lock()
            .ok()
            .map(|mut s| {
                if s.get(&dev).map(|x| x.conn_id) == Some(conn_id) {
                    s.remove(&dev).is_some()
                } else {
                    false
                }
            })
            .unwrap_or(false);
        if removed {
            if let Ok(mut ds) = self.devices.lock() {
                ds.touch(&dev, None, None, now_secs());
                let _ = ds.save(&self.devices_path);
            }
            self.emit_devices();
        }
    }

    /// Deletes a pairing. `notify_phone` sends `unpair` first so the phone forgets this PC too.
    pub fn forget(&self, device_id: &str, notify_phone: bool) {
        let removed = self
            .devices
            .lock()
            .map(|mut ds| {
                let r = ds.remove(device_id);
                if r {
                    let _ = ds.save(&self.devices_path);
                }
                r
            })
            .unwrap_or(false);
        let sess = self
            .sessions
            .lock()
            .ok()
            .and_then(|mut s| s.remove(device_id));
        if let Some(s) = sess {
            if notify_phone {
                let _ = s.tx.send(Out::Text(message("unpair", json!({}))));
            }
            let _ = s.tx.send(Out::Close);
        }
        if removed {
            self.emit_devices();
        }
    }

    pub fn forget_all(&self) {
        let ids: Vec<String> = self
            .devices
            .lock()
            .map(|d| d.devices.iter().map(|x| x.id.clone()).collect())
            .unwrap_or_default();
        for id in ids {
            self.forget(&id, true);
        }
        self.pairing_close();
    }

    /// Tells connected phones the PC's new name and refreshes the mDNS record.
    pub fn pc_renamed(&self) {
        let name = self.pc_name();
        if let Ok(s) = self.sessions.lock() {
            for sess in s.values() {
                let _ = sess
                    .tx
                    .send(Out::Text(message("pc.info", json!({ "pcName": name }))));
            }
        }
        self.advertise();
    }

    // ------------------------------------------------------------ views

    pub fn devices(&self) -> Vec<DeviceView> {
        let ds = self
            .devices
            .lock()
            .map(|d| d.devices.clone())
            .unwrap_or_default();
        let sessions = self.sessions.lock();
        let mut out: Vec<DeviceView> = ds
            .into_iter()
            .map(|d| {
                let sess = sessions.as_ref().ok().and_then(|s| s.get(&d.id));
                let r = sess.map(|s| s.report.clone()).unwrap_or_default();
                DeviceView {
                    connected: sess.is_some(),
                    battery: r.battery,
                    charging: r.charging,
                    network: r.network,
                    free_space_gb: r.free_space_gb,
                    id: d.id,
                    name: d.name,
                    model: d.model,
                    paired_at: d.paired_at,
                    last_seen: d.last_seen,
                }
            })
            .collect();
        out.sort_by(|a, b| {
            b.connected
                .cmp(&a.connected)
                .then(b.last_seen.cmp(&a.last_seen))
        });
        out
    }

    /// The phone the pill shows: the most recently connected one, else the most recently seen.
    pub fn primary_phone(&self) -> Option<PhoneStatus> {
        let connected = self.sessions.lock().ok().and_then(|s| {
            s.iter()
                .max_by_key(|(_, x)| x.since)
                .map(|(id, x)| (id.clone(), x.report.clone()))
        });
        if let Some((id, r)) = connected {
            let stored = self.devices.lock().ok().and_then(|d| d.get(&id).cloned());
            return Some(PhoneStatus {
                state: "connected".into(),
                name: stored.as_ref().map(|d| d.name.clone()).or(r.name),
                model: stored.map(|d| d.model).or(r.model),
                battery: r.battery,
                charging: r.charging,
                network: r.network,
                free_space_gb: r.free_space_gb,
                is_demo: false,
            });
        }
        let d = self
            .devices
            .lock()
            .ok()?
            .devices
            .iter()
            .max_by_key(|d| d.last_seen)
            .cloned()?;
        Some(PhoneStatus {
            state: "offline".into(),
            name: Some(d.name),
            model: Some(d.model),
            battery: None,
            charging: false,
            network: None,
            free_space_gb: None,
            is_demo: false,
        })
    }

    fn emit_devices(&self) {
        let _ = self.app.emit("devices-changed", self.devices());
        crate::emit_phone_status(&self.app);
    }

    // ------------------------------------------------------------ transfers (Phase 4)

    fn session_tx(&self, device_id: &str) -> Option<Tx> {
        self.sessions
            .lock()
            .ok()?
            .get(device_id)
            .map(|s| s.tx.clone())
    }

    /// The phone a manual send goes to: the most recently connected one.
    fn target_device(&self) -> Option<(String, String)> {
        let id = self
            .sessions
            .lock()
            .ok()?
            .iter()
            .max_by_key(|(_, s)| s.since)
            .map(|(id, _)| id.clone())?;
        let name = self
            .devices
            .lock()
            .ok()?
            .get(&id)
            .map(|d| d.name.clone())
            .unwrap_or_else(|| "phone".into());
        Some((id, name))
    }

    fn save_transfers(&self) {
        if let Ok(mut ts) = self.transfers.lock() {
            // Keep every unfinished transfer plus the newest finished ones.
            let finished = ts.iter().filter(|t| !t.is_active()).count();
            if finished > HISTORY_MAX {
                let mut drop_n = finished - HISTORY_MAX;
                ts.retain(|t| {
                    if drop_n > 0 && !t.is_active() {
                        drop_n -= 1;
                        false
                    } else {
                        true
                    }
                });
            }
            if let Ok(text) = serde_json::to_string(&*ts) {
                let tmp = self.transfers_path.with_extension("tmp");
                if std::fs::write(&tmp, text).is_ok() {
                    let _ = std::fs::rename(&tmp, &self.transfers_path);
                }
            }
        }
    }

    pub fn transfers_view(&self) -> Vec<TransferView> {
        let mut v: Vec<TransferView> = self
            .transfers
            .lock()
            .map(|ts| ts.iter().map(TransferView::from).collect())
            .unwrap_or_default();
        v.sort_by_key(|t| std::cmp::Reverse(t.created_at));
        v
    }

    fn emit_transfers(&self, force: bool) {
        if !force {
            if let Ok(mut last) = self.last_progress_emit.lock() {
                if last.elapsed() < Duration::from_millis(250) {
                    return;
                }
                *last = Instant::now();
            }
        }
        let _ = self.app.emit("transfers-changed", self.transfers_view());
    }

    fn update_transfer<R>(&self, id: &str, f: impl FnOnce(&mut Transfer) -> R) -> Option<R> {
        let mut ts = self.transfers.lock().ok()?;
        ts.iter_mut().find(|t| t.id == id).map(f)
    }

    /// Offers a held item to the connected phone so it can show the Catch screen.
    /// Returns the phone's name, or None when no phone is connected.
    pub fn hold_offer(
        &self,
        hold_id: &str,
        label: &str,
        file_count: u64,
        total_bytes: u64,
        is_folder: bool,
        secs: u64,
    ) -> Option<String> {
        let (device_id, name) = self.target_device()?;
        let tx = self.session_tx(&device_id)?;
        let _ = tx.send(Out::Text(message(
            "hold.offer",
            json!({ "holdId": hold_id, "label": label, "fileCount": file_count, "totalBytes": total_bytes, "isFolder": is_folder, "expiresInSecs": secs }),
        )));
        Some(name)
    }

    /// Tells connected phones a hold ended without being caught.
    pub fn hold_cancel(&self, hold_id: &str, reason: &str) {
        if let Ok(s) = self.sessions.lock() {
            for sess in s.values() {
                let _ = sess.tx.send(Out::Text(message(
                    "hold.cancel",
                    json!({ "holdId": hold_id, "reason": reason }),
                )));
            }
        }
    }

    /// Sends grabbed items after a catch (or "Send now"); the phone accepts it without asking.
    pub async fn send_items_for_hold(
        self: &Arc<Self>,
        paths: Vec<String>,
        texts: Vec<String>,
        hold_id: Option<String>,
        open_on_arrival: bool,
    ) -> Result<String, String> {
        self.send_inner(
            paths,
            texts,
            "auto".into(),
            hold_id,
            open_on_arrival.then_some(true),
        )
        .await
    }

    /// Starts a manual send of picked paths and/or texts to the connected phone.
    pub async fn send_items(
        self: &Arc<Self>,
        paths: Vec<String>,
        texts: Vec<String>,
        destination: String,
    ) -> Result<String, String> {
        self.send_inner(paths, texts, destination, None, None).await
    }

    async fn send_inner(
        self: &Arc<Self>,
        mut paths: Vec<String>,
        texts: Vec<String>,
        destination: String,
        hold_id: Option<String>,
        open_first: Option<bool>,
    ) -> Result<String, String> {
        // Long texts travel as .txt files (exact text and line breaks); links and short notes as text.
        let outbox = crate::outbox_dir(&self.app);
        let mut short = Vec::new();
        for t in texts {
            match crate::clip::classify(&t) {
                crate::clip::TextPlan::Long(long) => paths.push(
                    crate::clip::write_note(&outbox, &long, None)?
                        .to_string_lossy()
                        .into_owned(),
                ),
                crate::clip::TextPlan::Link(s) | crate::clip::TextPlan::Short(s) => short.push(s),
            }
        }
        let texts = short;
        let (device_id, device_name) = self
            .target_device()
            .ok_or("Your phone isn't connected right now.")?;
        let texts: Vec<String> = texts
            .into_iter()
            .map(|t| t.trim().chars().take(100_000).collect::<String>())
            .filter(|t| !t.is_empty())
            .collect();
        let p2 = paths.clone();
        let (files, label) =
            tauri::async_runtime::spawn_blocking(move || transfer::build_manifest(&p2))
                .await
                .map_err(|e| e.to_string())??;
        if files.is_empty() && texts.is_empty() {
            return Err("Nothing to send — the folders are empty.".into());
        }
        let label = if paths.is_empty() {
            if texts.len() == 1 {
                "Text".to_string()
            } else {
                format!("{} notes", texts.len())
            }
        } else {
            label
        };
        let settings = crate::current_settings(&self.app);
        let t = Transfer {
            id: random_id(),
            device_id: device_id.clone(),
            device_name,
            label,
            created_at: now_secs(),
            finished_at: None,
            state: "offered".into(),
            error: None,
            mode: settings.transfers.mode.clone(),
            destination: if destination == "downloads" {
                "downloads".into()
            } else {
                "auto".into()
            },
            open_first: open_first.unwrap_or(settings.transfers.open_first),
            total_bytes: files.iter().map(|f| f.size).sum(),
            files,
            texts,
            roots: paths,
            hold_id,
            files_done: 0,
            bytes_done: 0,
            moved: false,
        };
        let id = t.id.clone();
        let msg = offer_message(&t);
        if let Ok(mut ts) = self.transfers.lock() {
            ts.push(t);
        }
        self.save_transfers();
        self.emit_transfers(true);
        let tx = self
            .session_tx(&device_id)
            .ok_or("Your phone disconnected.")?;
        let _ = tx.send(Out::Text(msg));
        Ok(id)
    }

    fn on_transfer_msg(&self, device_id: &str, kind: &str, p: &Value) {
        let id = p
            .get("transferId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let mine = self
            .update_transfer(&id, |t| t.device_id == device_id)
            .unwrap_or(false);
        if !mine {
            return;
        }
        let mut finished_move: Option<Vec<String>> = None;
        self.update_transfer(&id, |t| match kind {
            "push.accept" if t.state == "offered" => {
                if t.files.is_empty() {
                    t.state = "done".into();
                    t.finished_at = Some(now_secs());
                    t.scrub();
                } else {
                    t.state = "sending".into();
                }
            }
            "push.decline" if t.is_active() => {
                t.state = "declined".into();
                t.finished_at = Some(now_secs());
                t.scrub();
            }
            "file.done" => {
                if let Some(i) = p.get("index").and_then(Value::as_u64) {
                    let i = i as usize;
                    if i < t.files.len() {
                        t.files_done = t.files_done.max(i as u32 + 1);
                        t.bytes_done = t.bytes_before(i + 1);
                    }
                }
            }
            "transfer.complete" if t.is_active() => {
                t.state = "done".into();
                t.files_done = t.files.len() as u32;
                t.bytes_done = t.total_bytes;
                t.finished_at = Some(now_secs());
                if t.mode == "move" && !t.roots.is_empty() {
                    finished_move = Some(t.roots.clone());
                }
                t.scrub();
            }
            "transfer.cancel" if t.is_active() => {
                t.state = "cancelled".into();
                t.finished_at = Some(now_secs());
                t.scrub();
            }
            _ => {}
        });
        if let Some(roots) = finished_move {
            // Move: the phone confirmed every file, so the PC copies go to the Recycle Bin (never a permanent delete).
            let result = trash::delete_all(&roots);
            self.update_transfer(&id, |t| match result {
                Ok(()) => t.moved = true,
                Err(e) => {
                    t.error = Some(format!(
                        "Sent, but couldn't move the PC copy to the Recycle Bin: {e}"
                    ))
                }
            });
        }
        self.save_transfers();
        self.emit_transfers(true);
    }

    async fn serve_chunk(&self, device_id: &str, tx: &Tx, p: &Value) {
        let id = p
            .get("transferId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let index = p.get("index").and_then(Value::as_u64).unwrap_or(u64::MAX) as usize;
        let offset = p.get("offset").and_then(Value::as_u64).unwrap_or(0);
        let length = p
            .get("length")
            .and_then(Value::as_u64)
            .unwrap_or(CHUNK_MAX)
            .min(CHUNK_MAX);
        let fail = |reason: &str| {
            let _ = tx.send(Out::Text(message(
                "transfer.error",
                json!({ "transferId": id, "index": index, "reason": reason }),
            )));
        };
        // Look the file up by index in this phone's own transfer, never by a path from the phone.
        let entry = self.update_transfer(&id, |t| {
            if t.device_id != device_id || !matches!(t.state.as_str(), "sending" | "paused") {
                return None;
            }
            let f = t.files.get(index)?.clone();
            t.state = "sending".into();
            t.bytes_done = t.bytes_before(index) + offset.min(f.size);
            Some(f)
        });
        let Some(Some(file)) = entry else {
            return fail("unknown");
        };
        if offset > file.size {
            return fail("changed");
        }
        let read =
            tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, &'static str> {
                use std::io::{Read, Seek, SeekFrom};
                let mut f = std::fs::File::open(&file.source).map_err(|_| "unreadable")?;
                let len = f.metadata().map_err(|_| "unreadable")?.len();
                if len != file.size {
                    return Err("changed");
                }
                f.seek(SeekFrom::Start(offset)).map_err(|_| "unreadable")?;
                let want = length.min(file.size - offset) as usize;
                let mut buf = vec![0u8; want];
                f.read_exact(&mut buf).map_err(|_| "unreadable")?;
                Ok(buf)
            })
            .await;
        match read {
            Ok(Ok(data)) => {
                let header = json!({ "t": id, "i": index, "o": offset })
                    .to_string()
                    .into_bytes();
                let mut frame = Vec::with_capacity(4 + header.len() + data.len());
                frame.extend_from_slice(&(header.len() as u32).to_be_bytes());
                frame.extend_from_slice(&header);
                frame.extend_from_slice(&data);
                let _ = tx.send(Out::Binary(frame));
                self.emit_transfers(false);
            }
            Ok(Err(reason)) => {
                self.update_transfer(&id, |t| {
                    t.state = "failed".into();
                    t.error = Some(
                        if reason == "changed" {
                            "A file changed on the PC while sending."
                        } else {
                            "A file couldn't be read."
                        }
                        .into(),
                    );
                    t.finished_at = Some(now_secs());
                    t.scrub();
                });
                self.save_transfers();
                self.emit_transfers(true);
                fail(reason)
            }
            Err(_) => fail("unreadable"),
        }
    }

    fn pause_transfers_of(&self, device_id: &str) {
        let changed = self
            .transfers
            .lock()
            .map(|mut ts| {
                let mut n = 0;
                for t in ts
                    .iter_mut()
                    .filter(|t| t.device_id == device_id && t.state == "sending")
                {
                    t.state = "paused".into();
                    n += 1;
                }
                n > 0
            })
            .unwrap_or(false);
        if changed {
            self.save_transfers();
            self.emit_transfers(true);
        }
    }

    pub fn cancel_transfer(&self, id: &str) {
        let device = self.update_transfer(id, |t| {
            if !t.is_active() {
                return None;
            }
            t.state = "cancelled".into();
            t.finished_at = Some(now_secs());
            t.scrub();
            Some(t.device_id.clone())
        });
        if let Some(Some(dev)) = device {
            if let Some(tx) = self.session_tx(&dev) {
                let _ = tx.send(Out::Text(message(
                    "transfer.cancel",
                    json!({ "transferId": id }),
                )));
            }
        }
        self.save_transfers();
        self.emit_transfers(true);
    }

    pub fn clear_transfer_history(&self) {
        if let Ok(mut ts) = self.transfers.lock() {
            ts.retain(|t| t.is_active());
        }
        self.save_transfers();
        self.emit_transfers(true);
    }
}

fn offer_message(t: &Transfer) -> String {
    let files: Vec<Value> = t
        .files
        .iter()
        .enumerate()
        .map(|(i, f)| json!({ "index": i, "path": f.path, "size": f.size }))
        .collect();
    message(
        "push.offer",
        json!({
            "transferId": t.id,
            "label": t.label,
            "destination": t.destination,
            "openFirst": t.open_first,
            "holdId": t.hold_id,
            "totalBytes": t.total_bytes,
            "files": files,
            "texts": t.texts,
        }),
    )
}
