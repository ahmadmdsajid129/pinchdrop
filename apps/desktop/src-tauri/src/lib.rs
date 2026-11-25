//! PinchDrop for Windows.
//! Two windows: `pill` (always-on-top pill / Dynamic Island) and `main`
//! (the full app). A tray icon, start-with-Windows, single instance and
//! persistent settings tie them together. Phase 3 adds the encrypted link
//! to paired phones (`link`).

mod clip;
mod explorer;
mod fs_info;
mod grab;
mod link;
mod phone;
mod pill;
mod settings;

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
    tray_show_pill: Mutex<Option<CheckMenuItem<Wry>>>,
}

impl AppState {
    fn snapshot(&self) -> Settings {
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
    commit_settings(app, next)
}

/// Shows or hides the pill according to settings, "hide for 1 hour" and
/// whether a full-screen app is in front.
fn refresh_pill_visibility(app: &AppHandle) {
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
    let fullscreen = s.pill.hide_in_fullscreen && pill::fullscreen_app_active();
    let want = s.pill.visible && !snoozed && !fullscreen;
    let is = win.is_visible().unwrap_or(false);
    if want && !is {
        let _ = win.show();
        let _ = win.set_always_on_top(true);
    } else if !want && is {
        let _ = win.hide();
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

fn open_main_at(app: &AppHandle, route: &str) {
    if let Some(win) = main_window(app) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.emit("navigate", route);
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
    Ok(link_of(&app)
        .ok_or("The connection service didn't start")?
        .pairing_open())
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
) -> Result<String, String> {
    let link = link_of(&app).ok_or("The connection service didn't start")?;
    link.send_items(paths, texts, destination).await
}

#[tauri::command]
fn list_transfers(app: AppHandle) -> Vec<link::transfer::TransferView> {
    link_of(&app)
        .map(|l| l.transfers_view())
        .unwrap_or_default()
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
fn hold_start(app: AppHandle, items: grab::GrabbedItems) -> Option<grab::HoldView> {
    let g = app.try_state::<grab::Grab>()?;
    let view = g.hold_start(&app, items);
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

#[tauri::command]
fn hold_state(app: AppHandle) -> Option<grab::HoldView> {
    app.try_state::<grab::Grab>().and_then(|g| g.hold_view())
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
    g.hold_deliver(&app, None).await
}

#[tauri::command]
fn unpair_device(app: AppHandle, id: String) {
    if let Some(l) = link_of(&app) {
        l.forget(&id, true);
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
    config_dir: String,
    /// SHA-256 of this PC's link certificate; phones pin it.
    fingerprint: Option<String>,
}

#[tauri::command]
fn get_app_info(app: AppHandle, state: State<AppState>) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            open_main_at(app, "home");
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
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
            app.manage(AppState {
                settings: Mutex::new(loaded),
                settings_path,
                config_dir,
                hidden_until: Mutex::new(None),
                tray_show_pill: Mutex::new(None),
            });

            let handle = app.handle().clone();
            let link_dir = app.state::<AppState>().config_dir.clone();
            match link::Link::new(handle.clone(), &link_dir) {
                Ok(l) => {
                    l.start();
                    app.manage(l);
                }
                // Not fatal: the app still runs; the Pair screen shows the error.
                Err(e) => eprintln!("PinchDrop link failed to start: {e}"),
            }
            app.manage(grab::Grab::default());
            clip::tidy_outbox(&outbox_dir(&handle));
            grab::spawn_hotkey_thread(handle.clone());
            allow_camera_in_webviews(&handle);
            build_tray(&handle)?;
            place_pill_initially(&handle);
            refresh_pill_visibility(&handle);

            if let Some(main) = main_window(&handle) {
                let h = handle.clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        if h.state::<AppState>().snapshot().keep_running_on_close {
                            api.prevent_close();
                            if let Some(w) = main_window(&h) {
                                let _ = w.hide();
                            }
                        } else {
                            h.exit(0);
                        }
                    }
                });
            }

            if first_run {
                open_main_at(&handle, "onboarding");
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
            clear_transfer_history,
            grab_arm_state,
            grab_selection,
            hold_start,
            hold_state,
            hold_cancel,
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
