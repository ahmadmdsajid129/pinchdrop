//! Phase 5: grabbing on the PC.
//!
//! * Decides when the webcam should run ("camera mode": only while something is
//!   selected in Explorer / on the Desktop, only after Ctrl+Shift+Space, or always)
//!   and shows the click-through `overlay` window, which runs hand tracking.
//! * When the overlay sees a pinch it asks for the current selection
//!   ([`grab_selection`]); when the hand opens it "holds" those items
//!   ([`hold_start`]). The hold counts down on the Dynamic Island and is offered
//!   to the phone, which catches it (P6) — or the user presses Send now.

use crate::explorer;
use crate::fs_info;
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

/// Keep the camera on this long after the selection disappears (clicking around shouldn't flicker it).
const DISARM_GRACE: Duration = Duration::from_millis(2500);
/// Ctrl+Shift+Space turns the camera on for this long.
const HOTKEY_WINDOW: Duration = Duration::from_secs(15);

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrabbedItems {
    pub paths: Vec<String>,
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
    hotkey_until: Mutex<Option<Instant>>,
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
    pub fn hotkey_pressed(&self) {
        if let Ok(mut g) = self.hotkey_until.lock() {
            *g = Some(Instant::now() + HOTKEY_WINDOW);
        }
    }

    /// One tick of the watcher (about every 600 ms): arm/disarm the camera and expire holds.
    pub fn tick(&self, app: &AppHandle) {
        self.expire_hold(app);
        let s = crate::current_settings(app);
        let g = &s.gestures;
        let holding = self.hold.lock().map(|h| h.is_some()).unwrap_or(false);
        let now = Instant::now();

        let (want, label) = if !g.enabled || holding {
            (false, None)
        } else {
            match g.camera_mode.as_str() {
                "always" => (true, explorer::current().map(|sel| label_for(&sel.paths))),
                "hotkey" => {
                    let on = self.hotkey_until.lock().ok().and_then(|h| *h).map(|t| now < t).unwrap_or(false);
                    (on, None)
                }
                // "on_select" (default): only while Explorer / the Desktop has a selection.
                _ => match explorer::current() {
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
                        let prev_label = self.arm.lock().ok().and_then(|a| a.as_ref().and_then(|a| a.label.clone()));
                        (recent, if recent { prev_label } else { None })
                    }
                },
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
        let secs = crate::current_settings(app).gestures.catch_secs.clamp(5, 120) as u64;
        let id = crate::link::proto::random_id();
        let phone_name = crate::link_of(app).and_then(|l| {
            l.hold_offer(&id, &items.label, items.file_count, items.total_bytes, items.is_folder, secs)
        });
        if let Ok(mut h) = self.hold.lock() {
            *h = Some(Hold { id, items, started: Instant::now(), total: Duration::from_secs(secs), phone_name });
        }
        if let Ok(mut a) = self.arm.lock() {
            *a = None; // re-evaluated (and switched off) on the next tick
        }
        set_overlay_visible(app, false);
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
            .map(|g| g.as_ref().map(|h| h.started.elapsed() >= h.total).unwrap_or(false))
            .unwrap_or(false);
        if expired {
            self.hold_end(app, "expired");
        }
    }

    pub fn hold_cancel(&self, app: &AppHandle) {
        self.hold_end(app, "cancelled");
    }

    /// The phone caught it (or the user pressed Send now): send the held items for real.
    pub async fn hold_deliver(&self, app: &AppHandle, hold_id: Option<&str>) -> Result<String, String> {
        if let Some(id) = hold_id {
            let matches = self.hold.lock().map(|g| g.as_ref().map(|h| h.id == id).unwrap_or(false)).unwrap_or(false);
            if !matches {
                return Err("That hold already ended.".into());
            }
        }
        let current_id = self.hold.lock().ok().and_then(|g| g.as_ref().map(|h| h.id.clone()));
        let items = self.hold_end(app, "caught").ok_or("Nothing is being held.")?;
        let link = crate::link_of(app).ok_or("The connection service didn't start")?;
        link.send_items_for_hold(items.paths, current_id).await
    }
}

/// Builds what a pinch grabs right now (selection + sizes), or None if nothing is selected.
pub fn grab_selection() -> Option<GrabbedItems> {
    let sel = explorer::current()?;
    let infos: Vec<fs_info::PathInfo> = sel.paths.iter().map(|p| fs_info::inspect(p)).collect();
    let readable: Vec<&fs_info::PathInfo> = infos.iter().filter(|i| i.error.is_none()).collect();
    if readable.is_empty() {
        return None;
    }
    Some(GrabbedItems {
        paths: readable.iter().map(|i| i.path.clone()).collect(),
        label: label_for(&sel.paths),
        file_count: readable.iter().map(|i| i.file_count).sum(),
        total_bytes: readable.iter().map(|i| i.size_bytes).sum(),
        is_folder: readable.len() == 1 && readable[0].is_dir,
        partial: readable.iter().any(|i| i.partial),
    })
}

/// Shows the full-screen click-through overlay (camera + hand ring + floating card) or hides it.
pub fn set_overlay_visible(app: &AppHandle, visible: bool) {
    let Some(win) = app.get_webview_window("overlay") else { return };
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

/// Watches Ctrl+Shift+Space while camera mode is "hotkey" (registered only then, so it isn't taken from other apps).
pub fn spawn_hotkey_thread(app: AppHandle) {
    #[cfg(windows)]
    std::thread::Builder::new()
        .name("pinchdrop-hotkey".into())
        .spawn(move || {
            use windows::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, UnregisterHotKey, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, VK_SPACE};
            use windows::Win32::UI::WindowsAndMessaging::{PeekMessageW, MSG, PM_REMOVE, WM_HOTKEY};
            const ID: i32 = 0x5044; // "PD"
            let mut registered = false;
            loop {
                let s = crate::current_settings(&app);
                let want = s.gestures.enabled && s.gestures.camera_mode == "hotkey";
                // SAFETY: hotkey registered and messages read on this same thread.
                unsafe {
                    if want && !registered {
                        registered = RegisterHotKey(None, ID, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, VK_SPACE.0 as u32).is_ok();
                    } else if !want && registered {
                        let _ = UnregisterHotKey(None, ID);
                        registered = false;
                    }
                    let mut msg = MSG::default();
                    while PeekMessageW(&mut msg, None, WM_HOTKEY, WM_HOTKEY, PM_REMOVE).as_bool() {
                        if msg.message == WM_HOTKEY && msg.wParam.0 as i32 == ID {
                            if let Some(g) = app.try_state::<Grab>() {
                                g.hotkey_pressed();
                                g.tick(&app);
                            }
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
        assert_eq!(label_for(&["C:\\a.txt".into(), "C:\\b.txt".into()]), "2 items");
    }
}
