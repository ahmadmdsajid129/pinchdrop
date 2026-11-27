//! PinchDrop for Windows.
//! Two windows: `pill` (always-on-top pill / Dynamic Island) and `main`
//! (the full app). A tray icon, start-with-Windows, single instance and
//! persistent settings tie them together. Phase 3 adds the encrypted link
//! to paired phones (`link`).

mod browser;
mod clip;
mod explorer;
mod fs_info;
mod grab;
mod hotspot;
mod huddle;
mod license;
mod link;
mod phone;
mod pill;
mod preview;
mod sendto;
mod settings;
mod shot;
mod toast;

use phone::PhoneStatus;
use serde::Serialize;
use serde_json::Value;
use settings::Settings;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow, WindowEvent, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;

pub struct AppState {
    settings: Mutex<Settings>,
    settings_path: PathBuf,
    config_dir: PathBuf,
    /// "Hide pill for 1 hour" deadline.
    hidden_until: Mutex<Option<Instant>>,
    /// Shown on purpose (shortcut, camera session, hold) even over a full-screen app, until then.
    shown_until: Mutex<Option<Instant>>,
    tray_show_pill: Mutex<Option<CheckMenuItem<Wry>>>,
    /// v2: the pill is fading out before it hides.
    pub pill_fading: std::sync::atomic::AtomicBool,
    /// v2: first run: show the main window once its page has drawn.
    pub show_main_when_ready: std::sync::atomic::AtomicBool,
}

impl AppState {
    pub(crate) fn snapshot(&self) -> Settings {
        self.settings.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

pub(crate) fn link_of(app: &AppHandle) -> Option<Arc<link::Link>> {
    app.try_state::<Arc<link::Link>>()
        .map(|l| l.inner().clone())
}

pub(crate) fn current_settings(app: &AppHandle) -> Settings {
    app.try_state::<AppState>()
        .map(|s| s.snapshot())
        .unwrap_or_default()
}

/// The name phones see for this PC.
pub(crate) fn current_pc_name(app: &AppHandle) -> String {
    app.try_state::<AppState>()
        .map(|s| s.snapshot().profile.pc_name)
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| "My PC".into())
}

/// What the pill and Island show: a real paired phone wins; otherwise the demo (if on) or nothing.
fn phone_status(app: &AppHandle) -> PhoneStatus {
    if let Some(real) = link_of(app).and_then(|l| l.primary_phone()) {
        return real;
    }
    let demo = app
        .try_state::<AppState>()
        .map(|s| s.snapshot().demo_phone)
        .unwrap_or(false);
    PhoneStatus::current(demo)
}

pub(crate) fn emit_phone_status(app: &AppHandle) {
    let _ = app.emit("phone-status", phone_status(app));
}

pub(crate) fn show_main_route(app: &AppHandle, route: &str) {
    open_main_at(app, route);
}

fn pill_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("pill")
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/// Replaces the stored settings, saves them and tells every window.
fn commit_settings(app: &AppHandle, next: Settings) -> Result<Settings, String> {
    let state = app.state::<AppState>();
    let previous = {
        let mut guard = state
            .settings
            .lock()
            .map_err(|_| "settings lock poisoned")?;
        let prev = guard.clone();
        *guard = next.clone();
        prev
    };
    settings::save(&state.settings_path, &next)?;
    let _ = app.emit("settings-changed", &next);
    if previous.demo_phone != next.demo_phone {
        emit_phone_status(app);
    }
    if previous.profile.pc_name != next.profile.pc_name {
        if let Some(l) = link_of(app) {
            l.pc_renamed();
        }
    }
    if previous.pill.visible != next.pill.visible {
        if let Ok(guard) = state.tray_show_pill.lock() {
            if let Some(item) = guard.as_ref() {
                let _ = item.set_checked(next.pill.visible);
            }
        }
    }
    refresh_pill_visibility(app);
    Ok(next)
}

fn patch_settings(app: &AppHandle, patch: Value) -> Result<Settings, String> {
    let current = app.state::<AppState>().snapshot();
    let next = settings::apply_patch(&current, &patch)?;
    let clip_changed = next.phone.clipboard_sync != current.phone.clipboard_sync;
    let phone_changed = next.phone.selected != current.phone.selected;
    let out = commit_settings(app, next);
    if phone_changed {
        emit_phone_status(app);
    }
    if clip_changed {
        if let Some(l) = link_of(app) {
            l.clip_config_all();
        }
    }
    out
}

/// Shows or hides the pill according to settings, "hide for 1 hour" and
/// whether a full-screen app is in front.
///
/// Always done on the main (UI) thread: a window created hidden and first shown from another
/// thread can come up with a blank WebView2 (the transparent pill then looks missing, the main
/// window looks white). That's what happened on first run.
fn refresh_pill_visibility(app: &AppHandle) {
    let h = app.clone();
    let _ = app.run_on_main_thread(move || refresh_pill_now(&h));
}

fn refresh_pill_now(app: &AppHandle) {
    let Some(win) = pill_window(app) else { return };
    let state = app.state::<AppState>();
    let s = state.snapshot();
    let snoozed = state
        .hidden_until
        .lock()
        .ok()
        .and_then(|g| *g)
        .map(|until| Instant::now() < until)
        .unwrap_or(false);
    let forced = state
        .shown_until
        .lock()
        .ok()
        .and_then(|g| *g)
        .map(|until| Instant::now() < until)
        .unwrap_or(false);
    let fullscreen = s.pill.hide_in_fullscreen && !forced && pill::fullscreen_app_active();
    // v2: the pill steps aside while the PinchDrop window is open (and before setup is done);
    // it comes back when the window is closed or minimised.
    let main_open = main_window(app)
        .map(|m| m.is_visible().unwrap_or(false) && !m.is_minimized().unwrap_or(false))
        .unwrap_or(false);
    let want = s.pill.visible && s.onboarded && !snoozed && !fullscreen && (!main_open || forced);
    let is = win.is_visible().unwrap_or(false);
    let fading = state.pill_fading.load(std::sync::atomic::Ordering::Relaxed);
    if want && (!is || fading) {
        state
            .pill_fading
            .store(false, std::sync::atomic::Ordering::Relaxed);
        let _ = win.show();
        let _ = win.set_always_on_top(true);
        // Fade in (the pill page animates it).
        let _ = app.emit_to("pill", "pill-fade", true);
    } else if !want && is && !fading {
        // Fade out first, then hide the window.
        state
            .pill_fading
            .store(true, std::sync::atomic::Ordering::Relaxed);
        let _ = app.emit_to("pill", "pill-fade", false);
        let h = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(260));
            let st = h.state::<AppState>();
            if st.pill_fading.load(std::sync::atomic::Ordering::Relaxed) {
                let h2 = h.clone();
                let _ = h.run_on_main_thread(move || {
                    let st = h2.state::<AppState>();
                    if st.pill_fading.load(std::sync::atomic::Ordering::Relaxed) {
                        if let Some(w) = pill_window(&h2) {
                            let _ = w.hide();
                        }
                        st.pill_fading
                            .store(false, std::sync::atomic::Ordering::Relaxed);
                    }
                });
            }
        });
    }
}

/// Keeps the pill/Island on screen for `secs` even while a full-screen app would hide it
/// (the user pressed the shortcut, or the camera / a hold is in use).
pub(crate) fn force_show_pill(app: &AppHandle, secs: u64) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut g) = state.shown_until.lock() {
            let until = Instant::now() + Duration::from_secs(secs);
            if g.map(|cur| cur < until).unwrap_or(true) {
                *g = Some(until);
            }
        }
    }
    refresh_pill_visibility(app);
}

/// Puts the pill above every other always-on-top window. Among topmost windows the last one
/// raised wins, so re-assert it.
pub(crate) fn raise_pill(app: &AppHandle) {
    if let Some(win) = pill_window(app) {
        let _ = win.set_always_on_top(false);
        let _ = win.set_always_on_top(true);
    }
}

/// The user pressed the shortcut: bring the Island to the very front, even over a focused
/// full-screen app (Windows lets a full-screen foreground window cover always-on-top windows,
/// and pauses drawing of covered ones). Windows allows this because the user pressed our hotkey.
/// Clicking back into the app folds the Island away as usual.
pub(crate) fn summon_pill(app: &AppHandle) {
    force_show_pill(app, 60);
    raise_pill(app);
    if let Some(win) = pill_window(app) {
        let _ = win.set_focus();
    }
}

fn place_pill_initially(app: &AppHandle) {
    let Some(win) = pill_window(app) else { return };
    let Some(rect) = pill::outer_rect(&win) else {
        return;
    };
    let s = app.state::<AppState>().snapshot();
    let monitors = win.available_monitors().unwrap_or_default();
    let saved_on_screen = match (s.pill.x, s.pill.y) {
        (Some(x), Some(y)) => monitors.iter().any(|m| {
            let wa = m.work_area();
            x >= wa.position.x
                && y >= wa.position.y
                && x < wa.position.x + wa.size.width as i32
                && y < wa.position.y + wa.size.height as i32
        }),
        _ => false,
    };
    if saved_on_screen {
        pill::set_rect(
            &win,
            s.pill.x.unwrap_or(0),
            s.pill.y.unwrap_or(0),
            rect.w,
            rect.h,
        );
    } else if let Some(work) = win.primary_monitor().ok().flatten().map(|m| {
        let wa = m.work_area();
        pill::Rect {
            x: wa.position.x,
            y: wa.position.y,
            w: wa.size.width as i32,
            h: wa.size.height as i32,
        }
    }) {
        let (x, y) = pill::default_position(work, rect.w, rect.h);
        pill::set_rect(&win, x, y, rect.w, rect.h);
    }
}

/// The window is 1200 × 800; on a small laptop screen that runs past the edges (title bar
/// buttons off screen). Shrink it to fit the work area and centre it.
fn fit_to_screen(win: &WebviewWindow) {
    let Some(mon) = win.current_monitor().ok().flatten() else {
        return;
    };
    let wa = mon.work_area();
    let Ok(size) = win.outer_size() else { return };
    let (max_w, max_h) = (wa.size.width * 92 / 100, wa.size.height * 92 / 100);
    let w = size.width.min(max_w);
    let h = size.height.min(max_h);
    if w != size.width || h != size.height {
        let _ = win.set_size(tauri::PhysicalSize::new(w, h));
    }
    let x = wa.position.x + (wa.size.width as i32 - w as i32) / 2;
    let y = wa.position.y + (wa.size.height as i32 - h as i32) / 2;
    let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
}

fn open_main_at(app: &AppHandle, route: &str) {
    // On the UI thread, for the same reason as the pill (see refresh_pill_visibility).
    let h = app.clone();
    let route = route.to_string();
    let _ = app.run_on_main_thread(move || open_main_now(&h, &route));
}

fn open_main_now(app: &AppHandle, route: &str) {
    if let Some(win) = main_window(app) {
        let _ = win.unminimize();
        let _ = win.show();
        // Once, after the first show (its real DPI size is known only then).
        static FITTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
        if !FITTED.swap(true, std::sync::atomic::Ordering::Relaxed) {
            fit_to_screen(&win);
        }
        let _ = win.set_focus();
        let _ = win.emit("navigate", route);
    }
    refresh_pill_now(app);
}

/// The main window's page has drawn: show it now if it's waiting (first run), so it never
/// appears as a blank or black rectangle.
#[tauri::command]
fn main_ready(app: AppHandle) {
    let pending = app
        .try_state::<AppState>()
        .map(|s| {
            s.show_main_when_ready
                .swap(false, std::sync::atomic::Ordering::Relaxed)
        })
        .unwrap_or(false);
    if pending {
        open_main_at(&app, "onboarding");
    }
}

// ---------------------------------------------------------------- commands

#[tauri::command]
fn get_settings(state: State<AppState>) -> Settings {
    state.snapshot()
}

#[tauri::command]
fn update_settings(app: AppHandle, patch: Value) -> Result<Settings, String> {
    patch_settings(&app, patch)
}

#[tauri::command]
fn get_phone_status(app: AppHandle) -> PhoneStatus {
    phone_status(&app)
}

// ---------------------------------------------------------------- link (Phase 3)

#[tauri::command]
fn pairing_open(app: AppHandle) -> Result<link::PairInfo, String> {
    let link = link_of(&app).ok_or("The connection service didn't start")?;
    // Free: one phone. A second (third…) phone needs Pro. Paired PCs don't count.
    let phones = link
        .devices()
        .iter()
        .filter(|d| !link::peer::is_peer_device_id(&d.id))
        .count();
    if phones >= 1 {
        license::need("phones")?;
    }
    Ok(link.pairing_open())
}

#[tauri::command]
fn pairing_close(app: AppHandle) {
    if let Some(l) = link_of(&app) {
        l.pairing_close();
    }
}

#[tauri::command]
fn pairing_request(app: AppHandle) -> Option<link::PairRequestView> {
    link_of(&app).and_then(|l| l.pair_request_view())
}

#[tauri::command]
fn pairing_respond(app: AppHandle, accept: bool) {
    if let Some(l) = link_of(&app) {
        l.pairing_respond(accept);
    }
}

#[tauri::command]
fn list_devices(app: AppHandle) -> Vec<link::DeviceView> {
    link_of(&app).map(|l| l.devices()).unwrap_or_default()
}

// ---------------------------------------------------------------- transfers (Phase 4)

#[tauri::command]
async fn send_items(
    app: AppHandle,
    paths: Vec<String>,
    texts: Vec<String>,
    destination: String,
    device_id: Option<String>,
) -> Result<String, String> {
    let link = link_of(&app).ok_or("The connection service didn't start")?;
    if let Some(d) = device_id
        .as_deref()
        .filter(|d| link::peer::is_peer_device_id(d))
    {
        return link.peer_send_now(d, paths, texts, None).await;
    }
    link.send_items(paths, texts, destination, device_id).await
}

/// v2 · Dropped on a device chip (or thrown at it): straight to that device, no catch needed.
#[tauri::command]
async fn send_to_device(
    app: AppHandle,
    items: grab::GrabbedItems,
    device_id: String,
) -> Result<String, String> {
    let link = link_of(&app).ok_or("The connection service didn't start")?;
    if link::peer::is_peer_device_id(&device_id) {
        return link
            .peer_send_now(&device_id, items.paths, items.texts, Some(items.label))
            .await;
    }
    link.send_items_for_hold(
        items.paths,
        items.texts,
        None,
        items.open_on_arrival,
        Some(device_id),
    )
    .await
}

#[tauri::command]
fn list_transfers(app: AppHandle) -> Vec<link::transfer::TransferView> {
    link_of(&app)
        .map(|l| l.transfers_view())
        .unwrap_or_default()
}

/// The look of a send (thumbnail, folder, link…) for its lift-off animation.
#[tauri::command]
async fn transfer_preview(app: AppHandle, id: String) -> Option<preview::Preview> {
    let (paths, texts) = link_of(&app)?.transfer_items(&id)?;
    tauri::async_runtime::spawn_blocking(move || {
        if !paths.is_empty() {
            Some(preview::for_paths(&paths))
        } else {
            let t = texts.first()?;
            Some(if clip::is_link(t) {
                let host = t
                    .split("://")
                    .nth(1)
                    .and_then(|r| r.split('/').next())
                    .unwrap_or("Link");
                preview::for_link(t, host)
            } else {
                preview::for_note(t)
            })
        }
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
fn cancel_transfer(app: AppHandle, id: String) {
    if let Some(l) = link_of(&app) {
        l.cancel_transfer(&id);
    }
}

#[tauri::command]
fn clear_transfer_history(app: AppHandle) {
    if let Some(l) = link_of(&app) {
        l.clear_transfer_history();
    }
}

// ---------------------------------------------------------------- grab (Phase 5)

#[tauri::command]
fn grab_arm_state(app: AppHandle) -> Option<grab::ArmState> {
    app.try_state::<grab::Grab>().and_then(|g| g.arm_state())
}

/// Called by the overlay the moment a pinch closes: what is selected right now?
/// (Explorer / Desktop selection first; otherwise the clipboard's link or text.)
#[tauri::command]
async fn grab_selection(app: AppHandle) -> Option<grab::GrabbedItems> {
    let outbox = outbox_dir(&app);
    tauri::async_runtime::spawn_blocking(move || grab::grab_selection(&outbox))
        .await
        .ok()
        .flatten()
}

/// Where long texts become files before they're sent.
pub(crate) fn outbox_dir(app: &AppHandle) -> PathBuf {
    app.try_state::<AppState>()
        .map(|s| s.config_dir.join("outbox"))
        .unwrap_or_else(|| std::env::temp_dir().join("PinchDrop").join("outbox"))
}

/// Called by the overlay when the hand opens with something grabbed.
#[tauri::command]
fn hold_start(
    app: AppHandle,
    items: grab::GrabbedItems,
    target: Option<String>,
) -> Option<grab::HoldView> {
    let g = app.try_state::<grab::Grab>()?;
    let view = g.hold_start_to(&app, items, target.as_deref());
    raise_pill(&app);
    // Open the Island so the countdown is visible.
    let _ = app.emit_to("pill", "island-open", ());
    Some(view)
}

/// The pill was clicked open: the camera may run until 30 s pass with nothing happening.
#[tauri::command]
fn gesture_session_start(app: AppHandle) -> Result<grab::SessionView, String> {
    app.try_state::<grab::Grab>()
        .ok_or("not ready")?
        .session_start(&app)
}

#[tauri::command]
fn gesture_session_stop(app: AppHandle) {
    if let Some(g) = app.try_state::<grab::Grab>() {
        g.session_stop(&app, "stopped");
    }
}

#[tauri::command]
fn gesture_session_state(app: AppHandle) -> Option<grab::SessionView> {
    app.try_state::<grab::Grab>().map(|g| g.session_view())
}

/// The overlay saw a real gesture: keep the camera on.
#[tauri::command]
fn gesture_activity(app: AppHandle) {
    if let Some(g) = app.try_state::<grab::Grab>() {
        g.activity(&app);
    }
}

/// The overlay hit a problem (camera missing / busy / tracking failed / nothing selected…).
#[tauri::command]
fn gesture_error(app: AppHandle, message: String, fatal: bool) {
    if let Some(g) = app.try_state::<grab::Grab>() {
        g.report_error(&app, &message, fatal);
    }
}

/// Shows the overlay window for a send animation (the pill then tells it what to play).
#[tauri::command]
fn overlay_flash(app: AppHandle, ms: u64) {
    grab::flash_overlay(&app, ms);
}

/// v2 · Two-hand screenshot: captures the framed area (overlay CSS pixels) and returns it as
/// a grabbed item. The overlay is hidden for a moment so it isn't in the picture.
#[tauri::command]
async fn capture_region(
    app: AppHandle,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<grab::GrabbedItems, String> {
    let win = app.get_webview_window("overlay").ok_or("No overlay")?;
    let pos = win.outer_position().map_err(|e| e.to_string())?;
    let k = win.scale_factor().unwrap_or(1.0);
    let (px, py) = (
        pos.x + (x * k).round() as i32,
        pos.y + (y * k).round() as i32,
    );
    let (pw, ph) = ((w * k).round() as i32, (h * k).round() as i32);
    let _ = win.hide();
    let dir = outbox_dir(&app);
    let shot = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_millis(160));
        shot::capture(&dir, px, py, pw, ph)
    })
    .await
    .map_err(|e| e.to_string())?;
    let _ = win.show();
    let path = shot?.to_string_lossy().into_owned();
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let label = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Screenshot.png".into());
    Ok(grab::GrabbedItems {
        preview: preview::for_paths(std::slice::from_ref(&path)),
        paths: vec![path],
        texts: Vec::new(),
        open_on_arrival: true,
        label,
        file_count: 1,
        total_bytes: size,
        is_folder: false,
        partial: false,
    })
}

#[tauri::command]
fn hold_state(app: AppHandle) -> Option<grab::HoldView> {
    app.try_state::<grab::Grab>().and_then(|g| g.hold_view())
}

// ---------- v2 · the phone's notifications, messages and contacts (in memory only)

fn link_or_err(app: &AppHandle) -> Result<Arc<link::Link>, String> {
    link_of(app).ok_or_else(|| "The connection service didn't start".to_string())
}

#[tauri::command]
fn phone_notifications(app: AppHandle) -> Vec<link::phone_data::NotifView> {
    link_of(&app).map(|l| l.notifications()).unwrap_or_default()
}

#[tauri::command]
async fn notif_dismiss(app: AppHandle, key: String) -> Result<(), String> {
    link_or_err(&app)?.notif_dismiss(&key).await
}

#[tauri::command]
async fn notif_reply(app: AppHandle, key: String, text: String) -> Result<(), String> {
    license::need("reply")?;
    let link = link_or_err(&app)?;
    let device = link.notif_device(&key);
    link.phone_request_to(
        device.as_deref(),
        "notif.reply",
        serde_json::json!({ "key": key, "text": text }),
        "notification access",
    )
    .await?;
    // Replied: handled, like replying on the phone. Clear it here and on the phone.
    let _ = link.notif_dismiss(&key).await;
    Ok(())
}

#[tauri::command]
async fn sms_threads(
    app: AppHandle,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    link_or_err(&app)?
        .phone_request_to(
            device_id.as_deref(),
            "sms.threads",
            serde_json::json!({ "limit": 80 }),
            "messages",
        )
        .await
}

#[tauri::command]
async fn sms_thread(
    app: AppHandle,
    thread_id: i64,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    link_or_err(&app)?
        .phone_request_to(
            device_id.as_deref(),
            "sms.thread",
            serde_json::json!({ "threadId": thread_id, "limit": 200 }),
            "messages",
        )
        .await
}

#[tauri::command]
async fn sms_send(
    app: AppHandle,
    address: String,
    text: String,
    device_id: Option<String>,
) -> Result<(), String> {
    license::need("reply")?;
    if address.trim().is_empty() || text.trim().is_empty() {
        return Err("Type a message first.".into());
    }
    link_or_err(&app)?
        .phone_request_to(
            device_id.as_deref(),
            "sms.send",
            serde_json::json!({ "address": address, "text": text }),
            "messages",
        )
        .await
        .map(|_| ())
}

#[tauri::command]
async fn contacts_list(
    app: AppHandle,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    link_or_err(&app)?
        .phone_request_to(
            device_id.as_deref(),
            "contacts.list",
            serde_json::json!({}),
            "contacts",
        )
        .await
}

#[tauri::command]
async fn phone_dial(
    app: AppHandle,
    number: String,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    link_or_err(&app)?
        .phone_request_to(
            device_id.as_deref(),
            "call.dial",
            serde_json::json!({ "number": number }),
            "calls",
        )
        .await
}

#[tauri::command]
fn phone_live() -> Vec<link::phone_live::PhoneLive> {
    link::phone_live::all()
}

#[tauri::command]
fn clear_missed(app: AppHandle, device_id: Option<String>) {
    if let Some(l) = link_of(&app) {
        l.clear_missed(device_id.as_deref());
    }
}

/// Answer / reject / silence the ringing phone (palm, swipe, fist, or a click).
#[tauri::command]
async fn call_action(
    app: AppHandle,
    action: String,
    device_id: Option<String>,
) -> Result<(), String> {
    license::need("calls")?;
    let kind = match action.as_str() {
        "answer" => "call.answer",
        "reject" => "call.reject",
        "silence" => "call.silence",
        _ => return Err("Unknown call action".into()),
    };
    link_or_err(&app)?
        .phone_request_to(
            device_id
                .or_else(link::phone_live::ringing_device)
                .as_deref(),
            kind,
            serde_json::json!({}),
            "calls",
        )
        .await
        .map(|_| ())
}

/// v2 · Now playing: play / pause / next / previous on a phone.
#[tauri::command]
async fn media_cmd(
    app: AppHandle,
    action: String,
    device_id: Option<String>,
) -> Result<(), String> {
    license::need("music")?;
    if !matches!(
        action.as_str(),
        "play" | "pause" | "toggle" | "next" | "previous"
    ) {
        return Err("Unknown media action".into());
    }
    link_or_err(&app)?
        .phone_request_to(
            device_id.as_deref(),
            "media.cmd",
            serde_json::json!({ "action": action }),
            "notification access",
        )
        .await
        .map(|_| ())
}

/// Find my phone: ring it loudly (or stop).
#[tauri::command]
async fn find_phone(app: AppHandle, stop: bool) -> Result<(), String> {
    link_or_err(&app)?
        .phone_request(
            if stop {
                "phone.ring.stop"
            } else {
                "phone.ring"
            },
            serde_json::json!({}),
            "find my phone",
        )
        .await
        .map(|_| ())
}

/// v2 · Explorer → Send to: send these files to that phone (the Island shows the progress).
fn send_from_shell(app: AppHandle, device: String, files: Vec<String>) {
    tauri::async_runtime::spawn(async move {
        // Just started by the shortcut: give the phone a moment to connect.
        for _ in 0..20 {
            if link_of(&app)
                .is_some_and(|l| l.devices().iter().any(|d| d.id == device && d.connected))
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
        if let Some(l) = link_of(&app) {
            let r = if link::peer::is_peer_device_id(&device) {
                l.peer_send_now(&device, files, Vec::new(), None).await
            } else {
                l.send_items(files, Vec::new(), "auto".into(), Some(device))
                    .await
            };
            if let Err(e) = r {
                let _ = app.emit("gesture-error", e);
            }
        }
    });
}

/// v2 · Phone files: one folder on a phone ("" = top).
#[tauri::command]
async fn phone_files(
    app: AppHandle,
    device_id: String,
    path: String,
) -> Result<serde_json::Value, String> {
    license::need("files")?;
    link_or_err(&app)?
        .phone_request_to(
            Some(&device_id),
            "files.list",
            serde_json::json!({ "path": path }),
            "all files",
        )
        .await
}

/// v2 · A small preview of a picture / video on a phone.
#[tauri::command]
async fn phone_file_thumb(
    app: AppHandle,
    device_id: String,
    path: String,
) -> Result<serde_json::Value, String> {
    license::need("files")?;
    link_or_err(&app)?
        .phone_request_to(
            Some(&device_id),
            "files.thumb",
            serde_json::json!({ "path": path }),
            "all files",
        )
        .await
}

/// v2 · Bring a phone's file to this PC, or (with `to`) pass it to another phone / PC.
#[tauri::command]
async fn phone_file_send(
    app: AppHandle,
    device_id: String,
    path: String,
    to: Option<String>,
) -> Result<(), String> {
    license::need("files")?;
    link_or_err(&app)?
        .phone_request_to(
            Some(&device_id),
            "files.send",
            serde_json::json!({ "path": path, "relay": to.unwrap_or_default() }),
            "all files",
        )
        .await
        .map(|_| ())
}

/// v2 · Every phone's last known place, for the map.
#[tauri::command]
fn phone_places(app: AppHandle) -> Vec<link::places::PlaceView> {
    // Pro: the map of where the phones are.
    if !license::is_pro() {
        return Vec::new();
    }
    link_of(&app).map(|l| l.places()).unwrap_or_default()
}

/// v2 · The latest photos on a phone (small previews).
#[tauri::command]
async fn phone_photos(
    app: AppHandle,
    device_id: Option<String>,
) -> Result<serde_json::Value, String> {
    license::need("photos")?;
    link_or_err(&app)?
        .phone_request_to(
            device_id.as_deref(),
            "photos.recent",
            serde_json::json!({ "limit": 12 }),
            "photos",
        )
        .await
}

/// v2 · Bring one of those photos to the PC (it lands and opens here).
#[tauri::command]
async fn phone_photo_send(
    app: AppHandle,
    id: i64,
    device_id: Option<String>,
) -> Result<(), String> {
    license::need("photos")?;
    link_or_err(&app)?
        .phone_request_to(
            device_id.as_deref(),
            "photos.send",
            serde_json::json!({ "id": id }),
            "photos",
        )
        .await
        .map(|_| ())
}

/// v2 · Lift: what the phone has in the air, if anything.
#[tauri::command]
fn lift_state(app: AppHandle) -> Option<link::lift::LiftView> {
    link_of(&app).and_then(|l| l.lift_view())
}

/// Open hand at the webcam, or Take it on the Island.
#[tauri::command]
fn lift_catch(app: AppHandle, id: Option<String>) -> Result<(), String> {
    link_of(&app)
        .ok_or("The connection service didn't start")?
        .lift_catch(id.as_deref())
}

/// "Not now" on the Island.
#[tauri::command]
fn lift_dismiss(app: AppHandle) {
    if let Some(l) = link_of(&app) {
        l.lift_drop(None, "cancelled");
    }
}

#[tauri::command]
fn hold_cancel(app: AppHandle) {
    if let Some(g) = app.try_state::<grab::Grab>() {
        g.hold_cancel(&app);
    }
}

/// "Send now" on the Island: skip the catch and send the held items.
#[tauri::command]
async fn hold_send_now(app: AppHandle) -> Result<String, String> {
    let g = app.try_state::<grab::Grab>().ok_or("not ready")?;
    g.hold_deliver(&app, None, None).await
}

#[tauri::command]
fn unpair_device(app: AppHandle, id: String) {
    if let Some(l) = link_of(&app) {
        if link::peer::is_peer_device_id(&id) {
            l.peer_unpair(&id);
        } else {
            l.forget(&id, true);
        }
    }
}

// ---------- v2 · laptop ↔ laptop

/// Other PinchDrop PCs on this Wi-Fi (takes ~2.5 s).
#[tauri::command]
async fn peer_discover(app: AppHandle) -> Result<Vec<link::peer::FoundPc>, String> {
    let link = link_or_err(&app)?;
    let own = link.identity.pc_id.clone();
    tauri::async_runtime::spawn_blocking(move || link::peer::discover(&own))
        .await
        .map_err(|e| e.to_string())
}

/// Pair with one of them; progress comes as `peer-pair` events.
#[tauri::command]
fn peer_pair_start(app: AppHandle, pc_id: String) -> Result<(), String> {
    link_or_err(&app)?.peer_pair_start(&pc_id)
}

/// The codes on both screens match (true) or not (false).
#[tauri::command]
fn peer_pair_answer(app: AppHandle, ok: bool) {
    if let Some(l) = link_of(&app) {
        l.peer_pair_answer(ok);
    }
}

#[tauri::command]
fn get_autostart(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let launcher = app.autolaunch();
    let result = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };
    result.map_err(|e| format!("Couldn't change start-with-Windows: {e}"))?;
    Ok(launcher.is_enabled().unwrap_or(enabled))
}

/// Resize the pill window to fit its content (CSS px), keeping the anchored side still.
#[tauri::command]
fn pill_resize(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let win = pill_window(&app).ok_or("pill window missing")?;
    let scale = win.scale_factor().unwrap_or(1.0);
    let w = (width * scale).round() as i32;
    let h = (height * scale).round() as i32;
    let old = pill::outer_rect(&win).ok_or("pill rect unavailable")?;
    if old.w == w && old.h == h {
        return Ok(());
    }
    let s = app.state::<AppState>().snapshot();
    let (x, y) = pill::anchored_position(old, w, h, &s.pill.anchor_h, &s.pill.anchor_v);
    let (x, y) = match pill::work_area(&win) {
        Some(work) => pill::clamp_into(work, x, y, w, h),
        None => (x, y),
    };
    pill::set_rect(&win, x, y, w, h);
    Ok(())
}

/// Called when a drag of the pill ends: snap to nearby edges and remember the spot.
#[tauri::command]
fn pill_drag_end(app: AppHandle) -> Result<(), String> {
    let win = pill_window(&app).ok_or("pill window missing")?;
    let r = pill::outer_rect(&win).ok_or("pill rect unavailable")?;
    let work = pill::work_area(&win).ok_or("no monitor")?;
    let (x, y, ah, av) = pill::snap(work, r);
    pill::set_rect(&win, x, y, r.w, r.h);
    patch_settings(
        &app,
        serde_json::json!({"pill": {"x": x, "y": y, "anchorH": ah, "anchorV": av}}),
    )?;
    Ok(())
}

#[tauri::command]
fn pill_reset_position(app: AppHandle) -> Result<(), String> {
    let win = pill_window(&app).ok_or("pill window missing")?;
    let r = pill::outer_rect(&win).ok_or("pill rect unavailable")?;
    let work = win
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let wa = m.work_area();
            pill::Rect {
                x: wa.position.x,
                y: wa.position.y,
                w: wa.size.width as i32,
                h: wa.size.height as i32,
            }
        })
        .ok_or("no monitor")?;
    let (x, y) = pill::default_position(work, r.w, r.h);
    pill::set_rect(&win, x, y, r.w, r.h);
    patch_settings(
        &app,
        serde_json::json!({"pill": {"x": x, "y": y, "anchorH": "center", "anchorV": "top"}}),
    )?;
    Ok(())
}

#[tauri::command]
fn pill_hide_for(app: AppHandle, minutes: u64) {
    if let Ok(mut g) = app.state::<AppState>().hidden_until.lock() {
        *g = Some(Instant::now() + Duration::from_secs(minutes * 60));
    }
    refresh_pill_visibility(&app);
}

#[tauri::command]
fn open_main(app: AppHandle, route: Option<String>) {
    open_main_at(&app, route.as_deref().unwrap_or("home"));
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    /// The Microsoft Store version (updates come from the Store).
    store: bool,
    config_dir: String,
    /// SHA-256 of this PC's link certificate; phones pin it.
    fingerprint: Option<String>,
}

// ---------------------------------------------------------------- Huddle (v2)

#[tauri::command]
fn huddle_state() -> huddle::HuddleView {
    huddle::view()
}

#[tauri::command]
async fn huddle_start(app: AppHandle, name: Option<String>) -> Result<huddle::HuddleView, String> {
    huddle::start(app, name).await
}

#[tauri::command]
async fn huddle_find() -> Vec<huddle::FoundHuddle> {
    tauri::async_runtime::spawn_blocking(huddle::find)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn huddle_join(app: AppHandle, ip: String, port: u16) -> Result<huddle::HuddleView, String> {
    huddle::join(app, ip, port).await
}

#[tauri::command]
async fn huddle_join_code(app: AppHandle, code: String) -> Result<huddle::HuddleView, String> {
    huddle::join_code(app, code).await
}

#[tauri::command]
async fn huddle_hotspot(on: bool) -> Result<huddle::HuddleView, String> {
    if on {
        huddle::hotspot_on().await
    } else {
        Ok(huddle::hotspot_off().await)
    }
}

#[tauri::command]
fn huddle_answer(req_id: String, ok: bool) {
    huddle::answer(&req_id, ok);
}

#[tauri::command]
fn huddle_leave() {
    huddle::leave();
}

#[tauri::command]
fn huddle_send_text(to: Option<String>, text: String) -> Result<String, String> {
    huddle::send_text(to, text)
}

#[tauri::command]
fn huddle_send_clipboard(to: Option<String>) -> Result<String, String> {
    huddle::send_clipboard(to)
}

#[tauri::command]
async fn huddle_send_paths(to: Option<String>, paths: Vec<String>) -> Result<String, String> {
    huddle::send_paths(to, paths).await
}

#[tauri::command]
async fn huddle_share(to: Option<String>, address: String) -> Result<String, String> {
    huddle::share(to, address).await
}

#[tauri::command]
fn huddle_pull(member: String) -> Result<(), String> {
    huddle::pull(&member)
}

#[tauri::command]
fn huddle_shelf() -> Vec<huddle::ShelfItem> {
    huddle::shelf()
}

#[tauri::command]
fn huddle_inbox() -> Vec<huddle::Incoming> {
    huddle::inbox()
}

#[tauri::command]
fn huddle_accept(
    app: AppHandle,
    id: String,
    folder: Option<String>,
    choices: Option<std::collections::HashMap<String, String>>,
) -> Result<huddle::AcceptResult, String> {
    huddle::accept(&app, &id, folder, choices.unwrap_or_default())
}

#[tauri::command]
fn huddle_dismiss(id: String) {
    huddle::dismiss(&id);
}

#[tauri::command]
fn huddle_open(app: AppHandle, id: String) -> Result<(), String> {
    huddle::open_item(&app, &id)
}

// ---------------------------------------------------------------- Pro (licence, trial)

#[tauri::command]
fn get_pro() -> license::ProStatus {
    license::status()
}

#[tauri::command]
async fn activate_license(app: AppHandle, key: String) -> Result<license::ProStatus, String> {
    let s = license::activate_any(&key).await?;
    let _ = app.emit("pro-changed", &s);
    Ok(s)
}

#[tauri::command]
async fn remove_license(app: AppHandle) -> license::ProStatus {
    let s = license::remove().await;
    let _ = app.emit("pro-changed", &s);
    s
}

#[tauri::command]
fn get_app_info(app: AppHandle, state: State<AppState>) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        store: cfg!(feature = "store"),
        config_dir: state.config_dir.to_string_lossy().into_owned(),
        fingerprint: link_of(&app).map(|l| l.identity.fingerprint.clone()),
    }
}

#[tauri::command]
fn open_config_folder(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    std::fs::create_dir_all(&state.config_dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(state.config_dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Sizes and file counts for paths picked in the Send screen. Runs off the UI thread.
#[tauri::command]
async fn inspect_paths(paths: Vec<String>) -> Vec<fs_info::PathInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        paths.iter().map(|p| fs_info::inspect(p)).collect()
    })
    .await
    .unwrap_or_default()
}

/// Resets everything to first-run defaults and unpairs every phone.
#[tauri::command]
fn reset_app(app: AppHandle) -> Result<Settings, String> {
    if let Some(l) = link_of(&app) {
        l.forget_all();
    }
    commit_settings(&app, Settings::default())
}

/// WebView2 would otherwise ask about the camera inside our own windows (and the overlay is
/// click-through, so a prompt there couldn't be answered). Only our bundled pages load in
/// these windows, so camera access is granted to them; the user chose Air gestures in Settings.
fn allow_camera_in_webviews(app: &AppHandle) {
    #[cfg(windows)]
    for label in ["main", "overlay"] {
        let Some(win) = app.get_webview_window(label) else {
            continue;
        };
        let _ = win.with_webview(|wv| {
            use webview2_com::Microsoft::Web::WebView2::Win32::{
                COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
                COREWEBVIEW2_PERMISSION_STATE_ALLOW,
            };
            use webview2_com::PermissionRequestedEventHandler;
            // SAFETY: COM calls on the webview's own controller, on its UI thread.
            unsafe {
                let Ok(core) = wv.controller().CoreWebView2() else {
                    return;
                };
                let mut token = Default::default();
                let _ = core.add_PermissionRequested(
                    &PermissionRequestedEventHandler::create(Box::new(|_, args| {
                        if let Some(args) = args {
                            let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                            args.PermissionKind(&mut kind)?;
                            if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA {
                                args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                            }
                        }
                        Ok(())
                    })),
                    &mut token,
                );
            }
        });
    }
    #[cfg(not(windows))]
    let _ = app;
}

// ---------------------------------------------------------------- tray

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open PinchDrop", true, None::<&str>)?;
    let send = MenuItem::with_id(app, "send", "Send files…", true, None::<&str>)?;
    let visible = app.state::<AppState>().snapshot().pill.visible;
    let show_pill =
        CheckMenuItem::with_id(app, "toggle_pill", "Show pill", true, visible, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit PinchDrop", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[&open, &send, &show_pill, &settings_item, &sep, &quit],
    )?;

    if let Ok(mut g) = app.state::<AppState>().tray_show_pill.lock() {
        *g = Some(show_pill.clone());
    }

    let mut builder = TrayIconBuilder::with_id("pinchdrop")
        .tooltip("PinchDrop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => open_main_at(app, "home"),
            "send" => open_main_at(app, "send"),
            "settings" => open_main_at(app, "settings"),
            "toggle_pill" => {
                let visible = app.state::<AppState>().snapshot().pill.visible;
                let _ = patch_settings(app, serde_json::json!({"pill": {"visible": !visible}}));
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                open_main_at(tray.app_handle(), "home");
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

// ---------------------------------------------------------------- run

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // v2: Explorer → Send to → PinchDrop · <phone> starts a second copy with the files.
            if let Some((device, files)) = sendto::parse_args(&args) {
                send_from_shell(app.clone(), device, files);
                return;
            }
            open_main_at(app, "home");
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("PinchDrop"));
            let settings_path = settings::settings_path(&config_dir);
            let loaded = settings::load(&settings_path);
            let first_run = !loaded.onboarded;
            license::init(&config_dir);
            // HTTPS for the licence service and updates uses the same crypto as the link.
            let _ = rustls::crypto::ring::default_provider().install_default();
            // Subscriptions: refresh the key shortly after start and twice a day.
            tauri::async_runtime::spawn(async {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                    license::refresh().await;
                    tokio::time::sleep(std::time::Duration::from_secs(12 * 3600)).await;
                }
            });
            // Updates from GitHub Releases (the Store version is updated by the Store).
            #[cfg(not(feature = "store"))]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            huddle::init(app.handle());
            app.manage(AppState {
                settings: Mutex::new(loaded),
                settings_path,
                config_dir,
                hidden_until: Mutex::new(None),
                shown_until: Mutex::new(None),
                tray_show_pill: Mutex::new(None),
                pill_fading: Default::default(),
                show_main_when_ready: Default::default(),
            });

            let handle = app.handle().clone();
            let link_dir = app.state::<AppState>().config_dir.clone();
            match link::Link::new(handle.clone(), &link_dir) {
                Ok(l) => {
                    l.start();
                    app.manage(l.clone());
                    l.refresh_sendto();
                }
                // Not fatal: the app still runs; the Pair screen shows the error.
                Err(e) => eprintln!("PinchDrop link failed to start: {e}"),
            }
            app.manage(grab::Grab::default());
            clip::tidy_outbox(&outbox_dir(&handle));
            grab::spawn_hotkey_thread(handle.clone());
            let argv: Vec<String> = std::env::args().collect();
            if let Some((device, files)) = sendto::parse_args(&argv) {
                send_from_shell(handle.clone(), device, files);
            }
            link::phone_live::spawn_clipboard_watch(handle.clone());
            allow_camera_in_webviews(&handle);
            build_tray(&handle)?;
            // v2: the program is now PinchDrop.exe; re-register "start with Windows" so it
            // points at this exe and not an older file name.
            {
                let auto = handle.autolaunch();
                if auto.is_enabled().unwrap_or(false) {
                    let _ = auto.enable();
                }
            }
            place_pill_initially(&handle);
            refresh_pill_visibility(&handle);

            if let Some(main) = main_window(&handle) {
                let h = handle.clone();
                main.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        if h.state::<AppState>().snapshot().keep_running_on_close {
                            api.prevent_close();
                            if let Some(w) = main_window(&h) {
                                let _ = w.hide();
                            }
                            // The pill comes back as the window goes.
                            refresh_pill_visibility(&h);
                        } else {
                            h.exit(0);
                        }
                    }
                    // Minimised / restored / shown: the pill follows at once.
                    WindowEvent::Resized(_) | WindowEvent::Focused(_) => {
                        refresh_pill_visibility(&h)
                    }
                    _ => {}
                });
            }

            if first_run {
                // Show the setup screen as soon as its page has loaded (main_ready), or after 3 s anyway.
                handle
                    .state::<AppState>()
                    .show_main_when_ready
                    .store(true, std::sync::atomic::Ordering::Relaxed);
                let h = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(3));
                    main_ready(h);
                });
            }

            // Re-check every 1.5 s whether the pill should hide for a full-screen app.
            let watcher = handle.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(1500));
                refresh_pill_visibility(&watcher);
            });
            // Every 600 ms: should the camera be on (selection / hotkey / always), and has a hold expired?
            let grabber = handle.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(600));
                if let Some(g) = grabber.try_state::<grab::Grab>() {
                    g.tick(&grabber);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            update_settings,
            get_pro,
            activate_license,
            remove_license,
            huddle_state,
            huddle_start,
            huddle_find,
            huddle_join,
            huddle_answer,
            huddle_join_code,
            huddle_hotspot,
            huddle_leave,
            huddle_send_text,
            huddle_send_clipboard,
            huddle_send_paths,
            huddle_share,
            huddle_pull,
            huddle_shelf,
            huddle_inbox,
            huddle_accept,
            huddle_dismiss,
            huddle_open,
            main_ready,
            get_phone_status,
            get_autostart,
            set_autostart,
            pill_resize,
            pill_drag_end,
            pill_reset_position,
            pill_hide_for,
            open_main,
            quit_app,
            get_app_info,
            open_config_folder,
            inspect_paths,
            reset_app,
            pairing_open,
            pairing_close,
            pairing_request,
            pairing_respond,
            list_devices,
            unpair_device,
            send_items,
            list_transfers,
            cancel_transfer,
            transfer_preview,
            clear_transfer_history,
            grab_arm_state,
            grab_selection,
            hold_start,
            hold_state,
            hold_cancel,
            lift_state,
            lift_catch,
            lift_dismiss,
            phone_notifications,
            notif_dismiss,
            notif_reply,
            sms_threads,
            sms_thread,
            sms_send,
            contacts_list,
            phone_dial,
            phone_live,
            send_to_device,
            capture_region,
            peer_discover,
            peer_pair_start,
            peer_pair_answer,
            clear_missed,
            call_action,
            find_phone,
            media_cmd,
            phone_places,
            phone_files,
            phone_file_thumb,
            phone_file_send,
            phone_photos,
            phone_photo_send,
            hold_send_now,
            gesture_session_start,
            gesture_session_stop,
            gesture_session_state,
            gesture_activity,
            gesture_error,
            overlay_flash
        ])
        .run(tauri::generate_context!())
        .expect("error while running PinchDrop");
}
