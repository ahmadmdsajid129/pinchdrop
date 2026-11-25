//! Phase 5: grabbing on the PC.
//!
//! * Decides when the webcam may run. Default ("on_click"): only after the user clicks
//!   the pill (or presses Ctrl+Shift+Space in "hotkey" mode), and it switches itself
//!   off after [`SESSION_IDLE`] without activity. "on_select" keeps it on while
//!   Explorer / the Desktop has a selection. There is no always-on mode.
//!   While allowed, the click-through `overlay` window runs hand tracking.
//! * When the overlay sees a pinch it asks for the current selection
//!   ([`grab_selection`]); when the hand opens it "holds" those items
//!   ([`hold_start`]). The hold counts down on the Dynamic Island and is offered
//!   to the phone, which catches it (P6) — or the user presses Send now.

use crate::explorer;
use crate::fs_info;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

/// Keep the camera on this long after the selection disappears ("on_select" mode).
const DISARM_GRACE: Duration = Duration::from_millis(2500);
/// A camera session ends after this long without activity (a new selection or a pinch).
pub const SESSION_IDLE: Duration = Duration::from_secs(30);

/// The live camera session shown on the Island.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub active: bool,
    /// Milliseconds until the camera switches itself off (0 when inactive).
    pub ends_in_ms: u64,
    pub idle_secs: u64,
    /// Why it ended: "idle" | "stopped" | "holding" | "error" | "disabled".
    pub reason: Option<String>,
}

struct Session {
    deadline: Instant,
    last_selection: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArmState {
    pub armed: bool,
    /// Short description of what a pinch would grab ("CPP", "3 items"), if known.
    pub label: Option<String>,
    pub camera_id: Option<String>,
    pub sensitivity: u8,
    pub show_ring: bool,
    pub sounds: bool,
}

/// Sent to the overlay on a pinch and handed back by it on release (hence Deserialize too).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrabbedItems {
    pub paths: Vec<String>,
    /// Links or short notes taken from the clipboard (sent as text; the phone opens links).
    #[serde(default)]
    pub texts: Vec<String>,
    /// Open it on the phone when it lands (notes and links from the clipboard).
    #[serde(default)]
    pub open_on_arrival: bool,
    pub label: String,
    pub file_count: u64,
    pub total_bytes: u64,
    pub is_folder: bool,
    pub partial: bool,
}

/// What the Island shows while something is held.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldView {
    pub id: String,
    pub label: String,
    pub file_count: u64,
    pub total_bytes: u64,
    pub is_folder: bool,
    pub expires_in_ms: u64,
    pub total_ms: u64,
    /// The phone it was offered to, if one is connected.
    pub phone_name: Option<String>,
}

struct Hold {
    id: String,
    items: GrabbedItems,
    started: Instant,
    total: Duration,
    phone_name: Option<String>,
}

#[derive(Default)]
pub struct Grab {
    arm: Mutex<Option<ArmState>>,
    last_selection_seen: Mutex<Option<Instant>>,
    session: Mutex<Option<Session>>,
    hold: Mutex<Option<Hold>>,
}

fn label_for(paths: &[String]) -> String {
    match paths {
        [one] => std::path::Path::new(one)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| one.clone()),
        _ => format!("{} items", paths.len()),
    }
}

impl Grab {
    // ------------------------------------------------------------ camera session (click / hotkey)

    pub fn session_view(&self) -> SessionView {
        let ends = self
            .session
            .lock()
            .ok()
            .and_then(|s| {
                s.as_ref()
                    .map(|s| s.deadline.saturating_duration_since(Instant::now()))
            })
            .unwrap_or_default();
        SessionView {
            active: !ends.is_zero(),
            ends_in_ms: ends.as_millis() as u64,
            idle_secs: SESSION_IDLE.as_secs(),
            reason: None,
        }
    }

    fn emit_session(&self, app: &AppHandle, reason: Option<&str>) {
        let mut v = self.session_view();
        v.reason = reason.map(str::to_string);
        let _ = app.emit("gesture-session", &v);
    }

    /// The user clicked the pill (or pressed the hotkey): allow the camera for [`SESSION_IDLE`].
    pub fn session_start(&self, app: &AppHandle) -> Result<SessionView, String> {
        let s = crate::current_settings(app);
        if !s.gestures.enabled {
            return Err("Air gestures are off. Turn them on in the Island or in Settings.".into());
        }
        if s.gestures.camera_mode == "on_select" {
            return Err(
                "The camera follows your selection in this mode (Settings → Gestures).".into(),
            );
        }
        if self.hold.lock().map(|h| h.is_some()).unwrap_or(false) {
            return Err("Something is already in the air.".into());
        }
        if let Ok(mut g) = self.session.lock() {
            *g = Some(Session {
                deadline: Instant::now() + SESSION_IDLE,
                last_selection: explorer::current().map(|s| s.paths),
            });
        }
        self.tick(app);
        self.emit_session(app, None);
        Ok(self.session_view())
    }

    /// Ends the camera session now (Island closed, Stop camera, error, hold started).
    pub fn session_stop(&self, app: &AppHandle, reason: &str) {
        let had = self
            .session
            .lock()
            .map(|mut g| g.take().is_some())
            .unwrap_or(false);
        if had {
            self.tick(app);
            self.emit_session(app, Some(reason));
        }
    }

    /// Something happened (a pinch, a new selection): keep the camera on for another [`SESSION_IDLE`].
    pub fn activity(&self, app: &AppHandle) {
        let extended = self
            .session
            .lock()
            .map(|mut g| match g.as_mut() {
                Some(s) => {
                    s.deadline = Instant::now() + SESSION_IDLE;
                    true
                }
                None => false,
            })
            .unwrap_or(false);
        if extended {
            self.emit_session(app, None);
        }
    }

    /// Hand tracking reported a problem. Fatal ones (no camera, camera busy, tracking failed) end the session.
    pub fn report_error(&self, app: &AppHandle, message: &str, fatal: bool) {
        let msg: String = message.chars().take(160).collect();
        let _ = app.emit("gesture-error", &msg);
        if fatal {
            self.session_stop(app, "error");
        }
    }

    /// Session bookkeeping for one tick: idle timeout, and a new selection counts as activity.
    fn session_tick(&self, app: &AppHandle) -> bool {
        let now = Instant::now();
        let (active, expired, check_selection) = match self.session.lock() {
            Ok(g) => match g.as_ref() {
                Some(s) if s.deadline > now => (true, false, true),
                Some(_) => (false, true, false),
                None => (false, false, false),
            },
            Err(_) => (false, false, false),
        };
        if expired {
            if let Ok(mut g) = self.session.lock() {
                *g = None;
            }
            self.emit_session(app, Some("idle"));
            return false;
        }
        if check_selection {
            let sel = explorer::current().map(|s| s.paths);
            let changed = self
                .session
                .lock()
                .map(|mut g| match g.as_mut() {
                    Some(s) if sel.is_some() && s.last_selection != sel => {
                        s.last_selection = sel.clone();
                        true
                    }
                    _ => false,
                })
                .unwrap_or(false);
            if changed {
                self.activity(app);
            }
        }
        active
    }

    /// One tick of the watcher (about every 600 ms): arm/disarm the camera and expire holds.
    pub fn tick(&self, app: &AppHandle) {
        self.expire_hold(app);
        let s = crate::current_settings(app);
        let g = &s.gestures;
        let holding = self.hold.lock().map(|h| h.is_some()).unwrap_or(false);
        let now = Instant::now();

        let session_on = self.session_tick(app);
        // While the camera or a hold is in use, the Island stays visible over full-screen apps.
        if session_on || holding {
            crate::force_show_pill(app, 3);
        }
        if (!g.enabled || holding) && session_on {
            // Gestures switched off or something is held: no camera.
            self.session_stop(app, if holding { "holding" } else { "disabled" });
        }
        let (want, label) = if !g.enabled || holding {
            (false, None)
        } else {
            match g.camera_mode.as_str() {
                // "on_select": only while Explorer / the Desktop has a selection.
                "on_select" => match explorer::current() {
                    Some(sel) => {
                        if let Ok(mut l) = self.last_selection_seen.lock() {
                            *l = Some(now);
                        }
                        (true, Some(label_for(&sel.paths)))
                    }
                    None => {
                        // Keep it on briefly, so focusing the camera or the pill doesn't switch it off mid-pinch.
                        let recent = self
                            .last_selection_seen
                            .lock()
                            .ok()
                            .and_then(|l| *l)
                            .map(|t| now.duration_since(t) < DISARM_GRACE)
                            .unwrap_or(false);
                        let prev_label = self
                            .arm
                            .lock()
                            .ok()
                            .and_then(|a| a.as_ref().and_then(|a| a.label.clone()));
                        (recent, if recent { prev_label } else { None })
                    }
                },
                // "on_click" (default) and "hotkey": only during a session the user started.
                _ => (
                    session_on,
                    if session_on {
                        explorer::current().map(|sel| label_for(&sel.paths))
                    } else {
                        None
                    },
                ),
            }
        };

        let next = ArmState {
            armed: want,
            label,
            camera_id: g.camera_id.clone(),
            sensitivity: g.sensitivity,
            show_ring: g.show_hand_ring,
            sounds: g.sounds,
        };
        let changed = self.arm.lock().map(|mut a| {
            let differs = a.as_ref() != Some(&next);
            *a = Some(next.clone());
            differs
        });
        if changed.unwrap_or(false) {
            set_overlay_visible(app, next.armed);
            let _ = app.emit("grab-arm", &next);
        }
    }

    pub fn arm_state(&self) -> Option<ArmState> {
        self.arm.lock().ok().and_then(|a| a.clone())
    }

    // ------------------------------------------------------------ holding

    pub fn hold_view(&self) -> Option<HoldView> {
        let g = self.hold.lock().ok()?;
        let h = g.as_ref()?;
        Some(HoldView {
            id: h.id.clone(),
            label: h.items.label.clone(),
            file_count: h.items.file_count,
            total_bytes: h.items.total_bytes,
            is_folder: h.items.is_folder,
            expires_in_ms: h.total.saturating_sub(h.started.elapsed()).as_millis() as u64,
            total_ms: h.total.as_millis() as u64,
            phone_name: h.phone_name.clone(),
        })
    }

    fn emit_hold(&self, app: &AppHandle) {
        let _ = app.emit("hold-changed", self.hold_view());
    }

    /// Starts holding grabbed items: counts down on the Island and offers them to the phone.
    pub fn hold_start(&self, app: &AppHandle, items: GrabbedItems) -> HoldView {
        let secs = crate::current_settings(app)
            .gestures
            .catch_secs
            .clamp(5, 120) as u64;
        let id = crate::link::proto::random_id();
        let phone_name = crate::link_of(app).and_then(|l| {
            l.hold_offer(
                &id,
                &items.label,
                items.file_count,
                items.total_bytes,
                items.is_folder,
                secs,
            )
        });
        if let Ok(mut h) = self.hold.lock() {
            *h = Some(Hold {
                id,
                items,
                started: Instant::now(),
                total: Duration::from_secs(secs),
                phone_name,
            });
        }
        if let Ok(mut a) = self.arm.lock() {
            *a = None; // re-evaluated (and switched off) on the next tick
        }
        set_overlay_visible(app, false);
        self.session_stop(app, "holding");
        self.emit_hold(app);
        self.hold_view().expect("just set")
    }

    /// Ends the hold. `reason` is told to the phone ("cancelled" | "expired" | "caught").
    fn hold_end(&self, app: &AppHandle, reason: &str) -> Option<GrabbedItems> {
        let h = self.hold.lock().ok().and_then(|mut g| g.take())?;
        if reason != "caught" {
            if let Some(l) = crate::link_of(app) {
                l.hold_cancel(&h.id, reason);
            }
        }
        self.emit_hold(app);
        Some(h.items)
    }

    fn expire_hold(&self, app: &AppHandle) {
        let expired = self
            .hold
            .lock()
            .map(|g| {
                g.as_ref()
                    .map(|h| h.started.elapsed() >= h.total)
                    .unwrap_or(false)
            })
            .unwrap_or(false);
        if expired {
            self.hold_end(app, "expired");
        }
    }

    pub fn hold_cancel(&self, app: &AppHandle) {
        self.hold_end(app, "cancelled");
    }

    /// The phone caught it (or the user pressed Send now): send the held items for real.
    pub async fn hold_deliver(
        &self,
        app: &AppHandle,
        hold_id: Option<&str>,
    ) -> Result<String, String> {
        if let Some(id) = hold_id {
            let matches = self
                .hold
                .lock()
                .map(|g| g.as_ref().map(|h| h.id == id).unwrap_or(false))
                .unwrap_or(false);
            if !matches {
                return Err("That hold already ended.".into());
            }
        }
        let current_id = self
            .hold
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|h| h.id.clone()));
        let items = self
            .hold_end(app, "caught")
            .ok_or("Nothing is being held.")?;
        let link = crate::link_of(app).ok_or("The connection service didn't start")?;
        link.send_items_for_hold(items.paths, items.texts, current_id, items.open_on_arrival)
            .await
    }
}

/// Builds what a pinch grabs right now: the Explorer / Desktop selection, or — when nothing is
/// selected — the clipboard (a link, a short note, or a long text turned into a file).
pub fn grab_selection(outbox: &std::path::Path) -> Option<GrabbedItems> {
    if let Some(sel) = explorer::current() {
        let infos: Vec<fs_info::PathInfo> = sel.paths.iter().map(|p| fs_info::inspect(p)).collect();
        let readable: Vec<&fs_info::PathInfo> =
            infos.iter().filter(|i| i.error.is_none()).collect();
        if readable.is_empty() {
            return None;
        }
        return Some(GrabbedItems {
            paths: readable.iter().map(|i| i.path.clone()).collect(),
            texts: Vec::new(),
            open_on_arrival: false,
            label: label_for(&sel.paths),
            file_count: readable.iter().map(|i| i.file_count).sum(),
            total_bytes: readable.iter().map(|i| i.size_bytes).sum(),
            is_folder: readable.len() == 1 && readable[0].is_dir,
            partial: readable.iter().any(|i| i.partial),
        });
    }
    let (text, html) = crate::clip::read()?;
    let base = GrabbedItems {
        paths: Vec::new(),
        texts: Vec::new(),
        open_on_arrival: true,
        label: String::new(),
        file_count: 0,
        total_bytes: text.len() as u64,
        is_folder: false,
        partial: false,
    };
    Some(match crate::clip::classify(&text) {
        crate::clip::TextPlan::Link(url) => {
            let host = url
                .split("://")
                .nth(1)
                .and_then(|r| r.split('/').next())
                .unwrap_or("Link")
                .to_string();
            GrabbedItems {
                texts: vec![url],
                label: host,
                ..base
            }
        }
        crate::clip::TextPlan::Short(t) => {
            let n = t.split_whitespace().count();
            let words: Vec<&str> = t.split_whitespace().take(4).collect();
            GrabbedItems {
                label: format!("“{}{}”", words.join(" "), if n > 4 { "…" } else { "" }),
                texts: vec![t],
                ..base
            }
        }
        crate::clip::TextPlan::Long(t) => {
            let path = crate::clip::write_note(outbox, &t, html.as_deref()).ok()?;
            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let label = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| "Note".into());
            GrabbedItems {
                paths: vec![path.to_string_lossy().into_owned()],
                file_count: 1,
                total_bytes: size,
                label,
                ..base
            }
        }
    })
}

/// Shows the full-screen click-through overlay (camera + hand ring + floating card) or hides it.
pub fn set_overlay_visible(app: &AppHandle, visible: bool) {
    let Some(win) = app.get_webview_window("overlay") else {
        return;
    };
    if visible {
        // Cover the monitor the user is working on (where the foreground window is), else the primary one.
        let monitor = win.primary_monitor().ok().flatten();
        if let Some(m) = monitor {
            let _ = win.set_position(PhysicalPosition::new(m.position().x, m.position().y));
            let _ = win.set_size(PhysicalSize::new(m.size().width, m.size().height));
        }
        let _ = win.set_ignore_cursor_events(true);
        let _ = win.show();
        let _ = win.set_always_on_top(true);
    } else {
        let _ = win.hide();
    }
}

/// Shows the click-through overlay for a short send animation, then hides it again unless the
/// camera needs it meanwhile.
pub fn flash_overlay(app: &AppHandle, ms: u64) {
    set_overlay_visible(app, true);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(ms.min(5000)));
        let armed = app
            .try_state::<Grab>()
            .and_then(|g| g.arm_state())
            .map(|a| a.armed)
            .unwrap_or(false);
        if !armed {
            set_overlay_visible(&app, false);
        }
    });
}

/// Ctrl+Shift+Space opens / closes the Island from anywhere (Settings → Pill & Island → Shortcut).
/// Registered only while that setting is on, so the keys stay free for other apps otherwise.
pub fn spawn_hotkey_thread(app: AppHandle) {
    #[cfg(windows)]
    std::thread::Builder::new()
        .name("pinchdrop-hotkey".into())
        .spawn(move || {
            use windows::Win32::UI::Input::KeyboardAndMouse::{
                RegisterHotKey, UnregisterHotKey, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, VK_SPACE,
            };
            use windows::Win32::UI::WindowsAndMessaging::{
                PeekMessageW, MSG, PM_REMOVE, WM_HOTKEY,
            };
            const ID: i32 = 0x5044; // "PD"
            let mut registered = false;
            loop {
                let s = crate::current_settings(&app);
                let want = s.pill.shortcut && s.pill.visible;
                // SAFETY: hotkey registered and messages read on this same thread.
                unsafe {
                    if want && !registered {
                        registered = RegisterHotKey(
                            None,
                            ID,
                            MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT,
                            VK_SPACE.0 as u32,
                        )
                        .is_ok();
                    } else if !want && registered {
                        let _ = UnregisterHotKey(None, ID);
                        registered = false;
                    }
                    let mut msg = MSG::default();
                    while PeekMessageW(&mut msg, None, WM_HOTKEY, WM_HOTKEY, PM_REMOVE).as_bool() {
                        if msg.message == WM_HOTKEY && msg.wParam.0 as i32 == ID {
                            // Bring the pill up even over a full-screen app, then open/close the Island.
                            crate::force_show_pill(&app, 60);
                            let _ = app.emit_to("pill", "island-toggle", ());
                        }
                    }
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        })
        .ok();
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_read_naturally() {
        assert_eq!(label_for(&["C:\\Users\\me\\Desktop\\CPP".into()]), "CPP");
        assert_eq!(
            label_for(&["C:\\a.txt".into(), "C:\\b.txt".into()]),
            "2 items"
        );
    }
}
