//! v2 · Live phone status on the PC (LINK-v1 §6.6): who's calling, unread texts (the pill's
//! 💬 badge), find my phone, and the clipboard both ways. In memory only.

use super::*;
use std::sync::LazyLock;

/// What the pill and the call card show.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PhoneLive {
    /// Unread text messages on the phone.
    pub unread: u32,
    /// "ringing" | "active" | "idle"
    pub call: String,
    pub caller_name: Option<String>,
    pub caller_number: Option<String>,
    /// A call rang out unanswered and hasn't been looked at yet.
    pub missed: Option<String>,
}

static LIVE: LazyLock<Mutex<PhoneLive>> = LazyLock::new(|| {
    Mutex::new(PhoneLive {
        call: "idle".into(),
        ..Default::default()
    })
});
/// Last text the phone put on our clipboard (so it isn't echoed straight back).
static FROM_PHONE: LazyLock<Mutex<Option<String>>> = LazyLock::new(Default::default);

fn s(p: &Value, k: &str, max: usize) -> Option<String> {
    p.get(k)
        .and_then(Value::as_str)
        .map(|v| v.chars().take(max).collect::<String>())
        .filter(|v| !v.is_empty())
}

pub fn live() -> PhoneLive {
    LIVE.lock().map(|l| l.clone()).unwrap_or_default()
}

pub fn ringing() -> bool {
    LIVE.lock().map(|l| l.call == "ringing").unwrap_or(false)
}

/// The phone put this on our clipboard; don't send it back.
pub fn came_from_phone(text: &str) -> bool {
    FROM_PHONE
        .lock()
        .map(|t| t.as_deref() == Some(text))
        .unwrap_or(false)
}

impl Link {
    fn emit_live(&self) {
        let _ = self.app.emit("phone-live", live());
    }

    pub(super) fn on_live_event(&self, kind: &str, p: &Value) {
        match kind {
            "call.state" => {
                let state = s(p, "state", 16).unwrap_or_default();
                let name = s(p, "name", 80);
                let number = s(p, "number", 40);
                if let Ok(mut l) = LIVE.lock() {
                    match state.as_str() {
                        "ringing" | "active" => {
                            l.call = state.clone();
                            l.caller_name = name.or(l.caller_name.take());
                            l.caller_number = number.or(l.caller_number.take());
                        }
                        "missed" => {
                            l.missed = name.or(number).or(Some("Unknown caller".into()));
                            l.call = "idle".into();
                            l.caller_name = None;
                            l.caller_number = None;
                        }
                        _ => {
                            l.call = "idle".into();
                            l.caller_name = None;
                            l.caller_number = None;
                        }
                    }
                }
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
                if let Ok(mut l) = LIVE.lock() {
                    l.unread = n;
                }
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
                }
                return;
            }
            _ => return,
        }
        self.emit_live();
    }

    pub fn clear_missed(&self) {
        if let Ok(mut l) = LIVE.lock() {
            l.missed = None;
        }
        self.emit_live();
    }

    pub(super) fn live_gone(&self) {
        if let Ok(mut l) = LIVE.lock() {
            *l = PhoneLive {
                call: "idle".into(),
                ..Default::default()
            };
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

/// Watches the PC clipboard and passes new text to the phone while sharing is on.
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
