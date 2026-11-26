//! Windows notifications (toasts) for Settings → Notifications:
//! "a send finishes or fails" and "my phone disconnects".
//!
//! Uses Windows' own toast API. Toasts are tied to the app ID the installer gives the Start
//! menu shortcut (the bundle identifier), so they show for the installed app; in a dev build
//! without that shortcut Windows may drop them silently, which is harmless.

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::link::transfer::TransferView as Transfer;

const APP_ID: &str = "com.pinchdrop.desktop";

/// Last state seen per transfer, so each finish is announced once.
static SEEN: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn terminal(state: &str) -> bool {
    matches!(state, "done" | "failed" | "declined" | "cancelled")
}

/// The window is in front: the user sees the result there, no toast needed.
fn window_in_front(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false)
}

/// Called with the current list whenever transfers change.
pub fn transfers_changed(app: &AppHandle, list: &[Transfer]) {
    let Ok(mut guard) = SEEN.lock() else { return };
    let first = guard.is_none();
    let seen = guard.get_or_insert_with(HashMap::new);
    let mut out: Vec<(String, String)> = Vec::new();
    for t in list {
        let before = seen.insert(t.id.clone(), t.state.clone());
        // On start-up, just remember what's there.
        if first {
            continue;
        }
        let was_open = before.as_deref().map(|s| !terminal(s)).unwrap_or(true);
        if !was_open || !terminal(&t.state) || t.state == "cancelled" {
            continue;
        }
        let incoming = t.direction == "in";
        let (title, body) = match (t.state.as_str(), incoming) {
            ("done", false) => (format!("Sent to {}", t.device_name), t.label.clone()),
            ("done", true) => (format!("Received from {}", t.device_name), t.label.clone()),
            ("declined", _) => (format!("{} declined", t.device_name), t.label.clone()),
            _ => (
                format!("Couldn't send to {}", t.device_name),
                match &t.error {
                    Some(e) => format!("{} · {e}", t.label),
                    None => t.label.clone(),
                },
            ),
        };
        out.push((title, body));
    }
    drop(guard);
    if out.is_empty() {
        return;
    }
    let on = app
        .try_state::<crate::AppState>()
        .map(|s| s.snapshot().notifications.on_finish)
        .unwrap_or(false);
    if !on || window_in_front(app) {
        return;
    }
    for (title, body) in out {
        show(&title, &body);
    }
}

/// A phone dropped off (its connection closed).
pub fn phone_disconnected(app: &AppHandle, name: &str) {
    let on = app
        .try_state::<crate::AppState>()
        .map(|s| s.snapshot().notifications.on_disconnect)
        .unwrap_or(false);
    if on {
        show(
            &format!("{name} disconnected"),
            "It reconnects by itself when it's back on this Wi-Fi.",
        );
    }
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(windows)]
pub fn show(title: &str, body: &str) {
    let xml = format!(
        r#"<toast><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual></toast>"#,
        esc(title),
        esc(body)
    );
    // Off the calling thread: WinRT start-up must never hold up the link.
    std::thread::spawn(move || {
        use windows::core::HSTRING;
        use windows::Data::Xml::Dom::XmlDocument;
        use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};
        let r = (|| -> windows::core::Result<()> {
            let doc = XmlDocument::new()?;
            doc.LoadXml(&HSTRING::from(xml))?;
            let toast = ToastNotification::CreateToastNotification(&doc)?;
            ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID))?
                .Show(&toast)
        })();
        if let Err(e) = r {
            eprintln!("PinchDrop: toast failed: {e}");
        }
    });
}

#[cfg(not(windows))]
pub fn show(_title: &str, _body: &str) {}

#[cfg(test)]
mod tests {
    use super::esc;

    #[test]
    fn escapes_xml() {
        assert_eq!(esc(r#"a<b>&"c""#), "a&lt;b&gt;&amp;&quot;c&quot;");
    }
}
