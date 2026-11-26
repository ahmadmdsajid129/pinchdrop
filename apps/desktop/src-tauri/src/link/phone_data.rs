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
    /// "sms" | "message" | "other" (picks the sound).
    pub kind: String,
    /// Which phone it's from (shown when more than one is connected).
    pub device_id: String,
    pub device_name: String,
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
fn notif_of(p: &Value, device_id: &str, device_name: &str) -> Option<NotifView> {
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
        kind: match p.get("kind").and_then(Value::as_str) {
            Some("sms") => "sms".into(),
            Some("message") => "message".into(),
            _ => "other".into(),
        },
        device_id: device_id.to_string(),
        device_name: device_name.to_string(),
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
        payload: Value,
        what: &str,
    ) -> Result<Value, String> {
        self.phone_request_to(None, kind, payload, what).await
    }

    /// Asks one phone (or, with `None`, the selected / most recent one).
    pub async fn phone_request_to(
        &self,
        device: Option<&str>,
        kind: &str,
        mut payload: Value,
        what: &str,
    ) -> Result<Value, String> {
        let device = match device.filter(|d| self.session_tx(d).is_some()) {
            Some(d) => d.to_string(),
            None => {
                self.target_phone()
                    .ok_or_else(|| friendly_error("offline", what))?
                    .0
            }
        };
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

    pub(super) fn on_notif_event(&self, dev: &str, kind: &str, p: &Value) {
        let name = self.device_name(dev);
        match kind {
            "notif.posted" => {
                let Some(n) = notif_of(p, dev, &name) else {
                    return;
                };
                if let Ok(mut list) = NOTIFS.lock() {
                    list.retain(|x| !(x.key == n.key && x.device_id == n.device_id));
                    list.insert(0, n.clone());
                    list.truncate(NOTIF_MAX);
                }
                // v2: a code in a text message is copied for pasting on the PC.
                if n.kind == "sms" {
                    self.maybe_copy_otp(&n.text, &n.title, dev);
                }
                // The Island shows it as a banner.
                let _ = self.app.emit("phone-notif", &n);
                crate::force_show_pill(&self.app, 8);
            }
            "notif.removed" => {
                let key = s(p, "key", 300);
                if let Ok(mut list) = NOTIFS.lock() {
                    list.retain(|x| !(x.key == key && x.device_id == dev));
                }
                let _ = self.app.emit("phone-notif-removed", key);
            }
            "notif.sync" => {
                let items: Vec<NotifView> = p
                    .get("items")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(|x| notif_of(x, dev, &name))
                            .take(NOTIF_MAX)
                            .collect()
                    })
                    .unwrap_or_default();
                if let Ok(mut list) = NOTIFS.lock() {
                    list.retain(|x| x.device_id != dev);
                    list.extend(items);
                    list.sort_by_key(|x| std::cmp::Reverse(x.time));
                    list.truncate(NOTIF_MAX);
                }
            }
            _ => return,
        }
        self.emit_notifications();
    }

    /// Dismissed on the PC: clear it here at once and on the phone.
    pub async fn notif_dismiss(&self, key: &str) -> Result<(), String> {
        let device = NOTIFS
            .lock()
            .ok()
            .and_then(|l| l.iter().find(|x| x.key == key).map(|x| x.device_id.clone()));
        if let Ok(mut list) = NOTIFS.lock() {
            list.retain(|x| x.key != key);
        }
        self.emit_notifications();
        self.phone_request_to(
            device.as_deref(),
            "notif.dismiss",
            json!({ "key": key }),
            "notification access",
        )
        .await
        .map(|_| ())
    }

    pub(super) fn on_sms_new(&self, dev: &str, p: &Value) {
        self.maybe_copy_otp(&s(p, "body", 2000), &s(p, "address", 64), dev);
        let msg = json!({
            "address": s(p, "address", 64),
            "name": p.get("name").and_then(Value::as_str),
            "body": s(p, "body", 2000),
            "date": p.get("date").and_then(Value::as_u64).unwrap_or_else(now_ms),
        });
        let _ = self.app.emit("sms-new", msg);
    }

    /// The phone went away: forget everything it shared.
    /// The phone a notification came from (for Reply).
    pub fn notif_device(&self, key: &str) -> Option<String> {
        NOTIFS
            .lock()
            .ok()?
            .iter()
            .find(|x| x.key == key)
            .map(|x| x.device_id.clone())
    }

    /// A phone went away (Wi-Fi drop, restart…). Its notifications stay until they're handled:
    /// when it reconnects it sends its current list (`notif.sync`), which replaces these, so
    /// anything opened or cleared on the phone meanwhile disappears here too.
    pub(super) fn phone_data_gone(&self, _dev: &str) {
        self.emit_notifications();
    }

    /// The phone was unpaired: its notifications go.
    pub fn notifications_forget_device(&self, dev: &str) {
        if let Ok(mut list) = NOTIFS.lock() {
            list.retain(|x| x.device_id != dev);
        }
        self.emit_notifications();
    }

    /// v2 · OTP auto-copy: a one-time code in a text message goes on the PC clipboard, and the
    /// Island says so ("Code 482913 · copied"). Only the code is kept, in memory.
    pub(super) fn maybe_copy_otp(&self, body: &str, from: &str, dev: &str) {
        // Pro: one-time codes copied by themselves.
        if !crate::license::is_pro() {
            return;
        }
        if let Some(code) = find_otp(body) {
            if crate::clip::write(&code) {
                let _ = self.app.emit(
                    "otp",
                    json!({ "code": code, "from": from, "deviceName": self.device_name(dev) }),
                );
                crate::force_show_pill(&self.app, 8);
            }
        }
    }
}

/// A one-time code in a message: 4–8 digits near a word like OTP / code / verification.
pub fn find_otp(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    const WORDS: [&str; 10] = [
        "otp",
        "code",
        "verification",
        "verify",
        "passcode",
        "one time",
        "one-time",
        "pin",
        "password",
        "कोड",
    ];
    if !WORDS.iter().any(|w| lower.contains(w)) {
        return None;
    }
    // Groups of digits, ignoring amounts (after Rs/₹/INR) and long numbers (accounts, phones).
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    let mut best: Option<String> = None;
    while i < chars.len() {
        if chars[i].is_ascii_digit() {
            let start = i;
            while i < chars.len() && chars[i].is_ascii_digit() {
                i += 1;
            }
            let run: String = chars[start..i].iter().collect();
            let before: String = chars[start.saturating_sub(5)..start]
                .iter()
                .collect::<String>()
                .to_lowercase();
            let money = before.contains("rs")
                || before.contains('₹')
                || before.contains("inr")
                || before.contains('$');
            let decimal = i < chars.len()
                && chars[i] == '.'
                && chars.get(i + 1).is_some_and(|c| c.is_ascii_digit());
            let part_of_bigger = start > 0
                && (chars[start - 1] == '-'
                    || chars[start - 1] == '/'
                    || chars[start - 1] == 'X'
                    || chars[start - 1] == 'x');
            if (4..=8).contains(&run.len())
                && !money
                && !decimal
                && !part_of_bigger
                && best.is_none()
            {
                best = Some(run);
            }
        } else {
            i += 1;
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nv(p: &Value) -> Option<NotifView> {
        notif_of(p, "d", "Phone")
    }

    #[test]
    fn finds_one_time_codes() {
        assert_eq!(
            find_otp("482913 is your OTP for HDFC Bank. Do not share.").as_deref(),
            Some("482913")
        );
        assert_eq!(
            find_otp("Your Instagram code is 845 210".replace(' ', "").as_str()).as_deref(),
            Some("845210")
        );
        assert_eq!(
            find_otp("Use verification code 7781 to sign in").as_deref(),
            Some("7781")
        );
        // amounts, accounts and plain messages are not codes
        assert_eq!(
            find_otp("Rs 2500 debited from A/c XX1234. OTP not required"),
            None
        );
        assert_eq!(find_otp("See you at 1930 tomorrow"), None);
        assert_eq!(find_otp("Your code: ₹4999.00 sale ends"), None);
    }

    #[test]
    fn notifications_are_read_and_trimmed() {
        let n = nv(&json!({
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
        let m = nv(&json!({ "key": "k2", "pkg": "com.whatsapp", "title": "Dad" })).unwrap();
        assert_eq!(m.icon.as_deref(), Some("data:image/png;base64,AAAA"));
        // Only PNG data URLs are kept as icons.
        let bad =
            nv(&json!({ "key": "k3", "pkg": "x", "icon": "https://evil.example/i.png" })).unwrap();
        assert_eq!(bad.icon, None);
        assert!(nv(&json!({ "title": "no key" })).is_none());
    }

    #[test]
    fn errors_read_as_plain_words() {
        assert!(friendly_error("no_permission", "messages").contains("Allow messages"));
        assert!(friendly_error("offline", "x").contains("isn't connected"));
    }
}
