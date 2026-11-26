//! v2 · Live phone status on the PC (LINK-v1 §6.6), per phone: who's calling (SIM or an app
//! like WhatsApp), unread texts (the pill's 💬 badge), missed calls, and the clipboard both
//! ways. In memory only.

use super::*;
use std::collections::HashMap;
use std::sync::LazyLock;

/// One phone's live state, for the pill and the call card.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PhoneLive {
    pub device_id: String,
    pub device_name: String,
    /// Unread text messages on the phone.
    pub unread: u32,
    /// "ringing" | "active" | "idle"
    pub call: String,
    pub caller_name: Option<String>,
    pub caller_number: Option<String>,
    /// The app the call came through ("WhatsApp", "Instagram"…); None = a normal SIM call.
    pub call_app: Option<String>,
    /// A call rang out unanswered and hasn't been looked at yet (who, and through which app).
    pub missed: Option<String>,
    pub missed_app: Option<String>,
}

static LIVE: LazyLock<Mutex<HashMap<String, PhoneLive>>> = LazyLock::new(Default::default);
/// Last text a phone put on our clipboard (so it isn't echoed straight back).
static FROM_PHONE: LazyLock<Mutex<Option<String>>> = LazyLock::new(Default::default);

fn s(p: &Value, k: &str, max: usize) -> Option<String> {
    p.get(k)
        .and_then(Value::as_str)
        .map(|v| v.chars().take(max).collect::<String>())
        .filter(|v| !v.is_empty())
}

/// Every connected phone's live state.
pub fn all() -> Vec<PhoneLive> {
    let mut v: Vec<PhoneLive> = LIVE
        .lock()
        .map(|l| l.values().cloned().collect())
        .unwrap_or_default();
    v.sort_by(|a, b| a.device_name.cmp(&b.device_name));
    v
}

/// Any phone ringing (the webcam listens for answer / reject / silence).
pub fn ringing() -> bool {
    LIVE.lock()
        .map(|l| l.values().any(|x| x.call == "ringing"))
        .unwrap_or(false)
}

/// The phone that's ringing, if any.
pub fn ringing_device() -> Option<String> {
    LIVE.lock()
        .ok()?
        .values()
        .find(|x| x.call == "ringing")
        .map(|x| x.device_id.clone())
}

/// A phone put this on our clipboard; don't send it back.
pub fn came_from_phone(text: &str) -> bool {
    FROM_PHONE
        .lock()
        .map(|t| t.as_deref() == Some(text))
        .unwrap_or(false)
}

impl Link {
    fn emit_live(&self) {
        let _ = self.app.emit("phone-live", all());
    }

    fn live_entry<R>(&self, dev: &str, f: impl FnOnce(&mut PhoneLive) -> R) -> Option<R> {
        let name = self.device_name(dev);
        let mut l = LIVE.lock().ok()?;
        let e = l.entry(dev.to_string()).or_insert_with(|| PhoneLive {
            device_id: dev.to_string(),
            call: "idle".into(),
            ..Default::default()
        });
        e.device_name = name;
        Some(f(e))
    }

    pub(super) fn on_live_event(&self, dev: &str, kind: &str, p: &Value) {
        match kind {
            "call.state" => {
                let state = s(p, "state", 16).unwrap_or_default();
                let name = s(p, "name", 80);
                let number = s(p, "number", 40);
                let app = s(p, "app", 40);
                self.live_entry(dev, |l| match state.as_str() {
                    "ringing" | "active" => {
                        if state == "ringing" && l.call != "ringing" {
                            l.caller_name = None;
                            l.caller_number = None;
                        }
                        l.call = state.clone();
                        l.caller_name = name.or(l.caller_name.take());
                        l.caller_number = number.or(l.caller_number.take());
                        l.call_app = app.clone().or(l.call_app.take());
                    }
                    "missed" => {
                        l.missed = name
                            .or(number)
                            .or(l.caller_name.take())
                            .or(Some("Unknown caller".into()));
                        l.missed_app = app.or(l.call_app.take());
                        l.call = "idle".into();
                        l.caller_name = None;
                        l.caller_number = None;
                        l.call_app = None;
                    }
                    _ => {
                        l.call = "idle".into();
                        l.caller_name = None;
                        l.caller_number = None;
                        l.call_app = None;
                    }
                });
                if state == "ringing" {
                    // Visible even over full-screen apps while it rings.
                    crate::force_show_pill(&self.app, 40);
                    let _ = self.app.emit_to("pill", "island-open", ());
                }
                // The webcam listens for answer / reject / silence only while it rings.
                if let Some(g) = self.app.try_state::<crate::grab::Grab>() {
                    g.tick(&self.app);
                }
            }
            "status.messages" => {
                let n = p
                    .get("unread")
                    .and_then(Value::as_u64)
                    .unwrap_or(0)
                    .min(9999) as u32;
                self.live_entry(dev, |l| l.unread = n);
            }
            "clip.set" => {
                if !crate::current_settings(&self.app).phone.clipboard_sync {
                    return;
                }
                if let Some(t) = s(p, "text", 100_000) {
                    if let Ok(mut f) = FROM_PHONE.lock() {
                        *f = Some(t.clone());
                    }
                    crate::clip::write(&t);
                    let _ = self.app.emit(
                        "phone-clip",
                        json!({ "deviceName": self.device_name(dev), "chars": t.chars().count() }),
                    );
                }
                return;
            }
            _ => return,
        }
        self.emit_live();
    }

    /// Clears the missed-call mark on one phone (or on all).
    pub fn clear_missed(&self, dev: Option<&str>) {
        if let Ok(mut l) = LIVE.lock() {
            for (id, x) in l.iter_mut() {
                if dev.map_or(true, |d| d == id) {
                    x.missed = None;
                    x.missed_app = None;
                }
            }
        }
        self.emit_live();
    }

    /// A phone disconnected: forget its live state.
    pub(super) fn live_gone(&self, dev: &str) {
        if let Ok(mut l) = LIVE.lock() {
            l.remove(dev);
        }
        self.emit_live();
    }

    /// Text copied on the PC goes to every connected phone (when switched on).
    pub fn clip_broadcast(&self, text: &str) {
        if text.is_empty() || text.len() > 100_000 || came_from_phone(text) {
            return;
        }
        if let Ok(s) = self.sessions.lock() {
            for sess in s.values() {
                let _ = sess
                    .tx
                    .send(Out::Text(message("clip.set", json!({ "text": text }))));
            }
        }
    }

    /// Tells the phones whether clipboard sharing is on (on connect and when the setting changes).
    pub fn clip_config_all(&self) {
        let on = crate::current_settings(&self.app).phone.clipboard_sync;
        if let Ok(s) = self.sessions.lock() {
            for sess in s.values() {
                let _ = sess
                    .tx
                    .send(Out::Text(message("clip.config", json!({ "enabled": on }))));
            }
        }
    }
}

/// Watches the PC clipboard and passes new text to the phones while sharing is on.
#[cfg(windows)]
pub fn spawn_clipboard_watch(app: AppHandle) {
    use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
    std::thread::Builder::new()
        .name("pinchdrop-clipboard".into())
        .spawn(move || {
            // SAFETY: GetClipboardSequenceNumber has no preconditions.
            let mut seen = unsafe { GetClipboardSequenceNumber() };
            loop {
                std::thread::sleep(Duration::from_millis(700));
                let now = unsafe { GetClipboardSequenceNumber() };
                if now == seen {
                    continue;
                }
                seen = now;
                if !crate::current_settings(&app).phone.clipboard_sync {
                    continue;
                }
                if let (Some(link), Some((text, _))) = (crate::link_of(&app), crate::clip::read()) {
                    link.clip_broadcast(&text);
                }
            }
        })
        .ok();
}

#[cfg(not(windows))]
pub fn spawn_clipboard_watch(_app: AppHandle) {}
