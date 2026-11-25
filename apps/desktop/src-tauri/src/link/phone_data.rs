//! v2 · The phone's notifications, text messages and contacts on the PC (LINK-v1 §6.6).
//!
//! Everything here lives in memory only: never written to disk, forgotten when the phone
//! disconnects or the app closes. The phone decides what's shared through its own permissions.

use super::*;
use std::collections::HashMap;
use std::sync::LazyLock;
use tokio::sync::oneshot;

/// Notifications kept for the Notifications screen (newest first).
const NOTIF_MAX: usize = 60;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

type Pending = HashMap<String, oneshot::Sender<Result<Value, String>>>;

static PENDING: LazyLock<Mutex<Pending>> = LazyLock::new(Default::default);
static NOTIFS: LazyLock<Mutex<Vec<NotifView>>> = LazyLock::new(Default::default);
/// App icons by package, sent by the phone once per session.
static ICONS: LazyLock<Mutex<HashMap<String, String>>> = LazyLock::new(Default::default);

/// One phone notification as the Island and the Notifications screen show it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NotifView {
    pub key: String,
    pub pkg: String,
    pub app: String,
    pub title: String,
    pub text: String,
    pub time: u64,
    pub can_reply: bool,
    pub icon: Option<String>,
}

fn s(p: &Value, k: &str, max: usize) -> String {
    p.get(k)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .chars()
        .take(max)
        .collect()
}

/// Reads one notification from the phone. Icons are kept only if they're small PNG data URLs.
fn notif_of(p: &Value) -> Option<NotifView> {
    let key = s(p, "key", 300);
    if key.is_empty() {
        return None;
    }
    let pkg = s(p, "pkg", 200);
    let icon = Some(s(p, "icon", 24 * 1024))
        .filter(|i| i.starts_with("data:image/png;base64,") && i.len() < 24 * 1024);
    if let (Some(i), Ok(mut icons)) = (&icon, ICONS.lock()) {
        icons.insert(pkg.clone(), i.clone());
    }
    let icon = icon.or_else(|| ICONS.lock().ok().and_then(|m| m.get(&pkg).cloned()));
    Some(NotifView {
        key,
        app: s(p, "app", 80),
        pkg,
        title: s(p, "title", 200),
        text: s(p, "text", 600),
        time: p.get("time").and_then(Value::as_u64).unwrap_or_else(now_ms),
        can_reply: p.get("canReply").and_then(Value::as_bool).unwrap_or(false),
        icon,
    })
}

/// Plain-words message for a request the phone couldn't answer.
pub fn friendly_error(code: &str, what: &str) -> String {
    match code {
        "no_permission" => {
            format!("Allow {what} on your phone first: PinchDrop → Settings → Permissions.")
        }
        "offline" => "Your phone isn't connected. Open PinchDrop on it (same Wi-Fi).".into(),
        "timeout" => "Your phone didn't answer. Check that PinchDrop is running on it.".into(),
        _ => format!("Your phone couldn't do that ({what})."),
    }
}

impl Link {
    /// Asks the connected phone something and waits for its `phone.reply`.
    pub async fn phone_request(
        &self,
        kind: &str,
        mut payload: Value,
        what: &str,
    ) -> Result<Value, String> {
        let (device, _) = self
            .target_device()
            .ok_or_else(|| friendly_error("offline", what))?;
        let tx = self
            .session_tx(&device)
            .ok_or_else(|| friendly_error("offline", what))?;
        let req_id = random_id();
        payload["reqId"] = Value::String(req_id.clone());
        let (otx, orx) = oneshot::channel();
        if let Ok(mut p) = PENDING.lock() {
            p.insert(req_id.clone(), otx);
        }
        if tx.send(Out::Text(message(kind, payload))).is_err() {
            if let Ok(mut p) = PENDING.lock() {
                p.remove(&req_id);
            }
            return Err(friendly_error("offline", what));
        }
        let answer = timeout(REQUEST_TIMEOUT, orx).await;
        if let Ok(mut p) = PENDING.lock() {
            p.remove(&req_id);
        }
        match answer {
            Ok(Ok(Ok(data))) => Ok(data),
            Ok(Ok(Err(code))) => Err(friendly_error(&code, what)),
            _ => Err(friendly_error("timeout", what)),
        }
    }

    pub(super) fn on_phone_reply(&self, p: &Value) {
        let id = s(p, "reqId", 64);
        let waiter = PENDING.lock().ok().and_then(|mut m| m.remove(&id));
        if let Some(w) = waiter {
            let ok = p.get("ok").and_then(Value::as_bool).unwrap_or(false);
            let _ = w.send(if ok {
                Ok(p.get("data").cloned().unwrap_or(Value::Null))
            } else {
                Err(s(p, "error", 40))
            });
        }
    }

    pub fn notifications(&self) -> Vec<NotifView> {
        NOTIFS.lock().map(|n| n.clone()).unwrap_or_default()
    }

    fn emit_notifications(&self) {
        let _ = self.app.emit("phone-notifs", self.notifications());
    }

    pub(super) fn on_notif_event(&self, kind: &str, p: &Value) {
        match kind {
            "notif.posted" => {
                let Some(n) = notif_of(p) else { return };
                if let Ok(mut list) = NOTIFS.lock() {
                    list.retain(|x| x.key != n.key);
                    list.insert(0, n.clone());
                    list.truncate(NOTIF_MAX);
                }
                // The Island shows it as a banner.
                let _ = self.app.emit("phone-notif", &n);
                crate::force_show_pill(&self.app, 8);
            }
            "notif.removed" => {
                let key = s(p, "key", 300);
                if let Ok(mut list) = NOTIFS.lock() {
                    list.retain(|x| x.key != key);
                }
                let _ = self.app.emit("phone-notif-removed", key);
            }
            "notif.sync" => {
                let items: Vec<NotifView> = p
                    .get("items")
                    .and_then(Value::as_array)
                    .map(|a| a.iter().filter_map(notif_of).take(NOTIF_MAX).collect())
                    .unwrap_or_default();
                if let Ok(mut list) = NOTIFS.lock() {
                    *list = items;
                }
            }
            _ => return,
        }
        self.emit_notifications();
    }

    /// Dismissed on the PC: clear it here at once and on the phone.
    pub async fn notif_dismiss(&self, key: &str) -> Result<(), String> {
        if let Ok(mut list) = NOTIFS.lock() {
            list.retain(|x| x.key != key);
        }
        self.emit_notifications();
        self.phone_request(
            "notif.dismiss",
            json!({ "key": key }),
            "notification access",
        )
        .await
        .map(|_| ())
    }

    pub(super) fn on_sms_new(&self, p: &Value) {
        let msg = json!({
            "address": s(p, "address", 64),
            "name": p.get("name").and_then(Value::as_str),
            "body": s(p, "body", 2000),
            "date": p.get("date").and_then(Value::as_u64).unwrap_or_else(now_ms),
        });
        let _ = self.app.emit("sms-new", msg);
    }

    /// The phone went away: forget everything it shared.
    pub(super) fn phone_data_gone(&self) {
        if let Ok(mut list) = NOTIFS.lock() {
            list.clear();
        }
        if let Ok(mut icons) = ICONS.lock() {
            icons.clear();
        }
        self.emit_notifications();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notifications_are_read_and_trimmed() {
        let n = notif_of(&json!({
            "key": "0|com.whatsapp|1", "pkg": "com.whatsapp", "app": "WhatsApp",
            "title": "Mom", "text": "x".repeat(900), "time": 5, "canReply": true,
            "icon": "data:image/png;base64,AAAA"
        }))
        .unwrap();
        assert_eq!(
            (n.app.as_str(), n.title.as_str(), n.time, n.can_reply),
            ("WhatsApp", "Mom", 5, true)
        );
        assert_eq!(n.text.chars().count(), 600);
        // Later notifications from the same app reuse its icon.
        let m = notif_of(&json!({ "key": "k2", "pkg": "com.whatsapp", "title": "Dad" })).unwrap();
        assert_eq!(m.icon.as_deref(), Some("data:image/png;base64,AAAA"));
        // Only PNG data URLs are kept as icons.
        let bad =
            notif_of(&json!({ "key": "k3", "pkg": "x", "icon": "https://evil.example/i.png" }))
                .unwrap();
        assert_eq!(bad.icon, None);
        assert!(notif_of(&json!({ "title": "no key" })).is_none());
    }

    #[test]
    fn errors_read_as_plain_words() {
        assert!(friendly_error("no_permission", "messages").contains("Allow messages"));
        assert!(friendly_error("offline", "x").contains("isn't connected"));
    }
}
