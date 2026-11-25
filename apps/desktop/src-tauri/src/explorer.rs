//! Phase 5: what is selected right now in File Explorer or on the Desktop.
//!
//! Reads the real selection through the Shell's COM interfaces (no guessing by
//! name). COM objects must live on one apartment thread, so a single worker
//! thread owns them and answers requests over a channel. Read-only: nothing is
//! opened, moved or changed.

use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

/// Where the selection came from.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    Explorer,
    Desktop,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub source: Source,
    /// Absolute file-system paths. Virtual items (This PC, Recycle Bin…) are skipped.
    pub paths: Vec<String>,
}

type Reply = mpsc::Sender<Option<Selection>>;

static WORKER: Mutex<Option<mpsc::Sender<Reply>>> = Mutex::new(None);

/// Returns the selection in the foreground Explorer window or on the Desktop,
/// or None when something else is in front or nothing is selected.
pub fn current() -> Option<Selection> {
    let tx = {
        let mut g = WORKER.lock().ok()?;
        if g.is_none() {
            let (tx, rx) = mpsc::channel::<Reply>();
            std::thread::Builder::new()
                .name("pinchdrop-explorer".into())
                .spawn(move || imp::serve(rx))
                .ok()?;
            *g = Some(tx);
        }
        g.as_ref()?.clone()
    };
    let (reply_tx, reply_rx) = mpsc::channel();
    tx.send(reply_tx).ok()?;
    reply_rx.recv_timeout(Duration::from_millis(1500)).ok().flatten()
}

#[cfg(windows)]
mod imp {
    use super::{Reply, Selection, Source};
    use std::sync::mpsc::Receiver;
    use windows::core::Interface;
    use windows::Win32::System::Variant::{VARIANT, VT_I4};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, IServiceProvider, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        IFolderView, IShellBrowser, IShellItemArray, IShellWindows, IWebBrowserApp, ShellWindows, SID_STopLevelBrowser,
        SIGDN_FILESYSPATH, SVGIO_SELECTION, SWC_DESKTOP, SWFO_NEEDDISPATCH,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GetClassNameW, GetForegroundWindow, IsWindowVisible, GA_ROOT};

    fn var_i4(v: i32) -> VARIANT {
        let mut var = VARIANT::default();
        // SAFETY: writing the tag and matching union member of a zeroed VARIANT.
        unsafe {
            (*var.Anonymous.Anonymous).vt = VT_I4;
            (*var.Anonymous.Anonymous).Anonymous.lVal = v;
        }
        var
    }

    pub fn serve(rx: Receiver<Reply>) {
        // SAFETY: called once at the start of this dedicated thread.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        while let Ok(reply) = rx.recv() {
            let _ = reply.send(read().ok().flatten());
        }
    }

    fn class_of(hwnd: HWND) -> String {
        let mut buf = [0u16; 64];
        // SAFETY: buffer is valid for its length.
        let n = unsafe { GetClassNameW(hwnd, &mut buf) };
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }

    /// Selected file-system paths of one shell browser's active view.
    fn selection_of(browser: &IShellBrowser) -> windows::core::Result<Option<Vec<String>>> {
        // SAFETY: plain COM calls on valid interfaces; strings are freed with CoTaskMemFree.
        unsafe {
            let view = browser.QueryActiveShellView()?;
            // Explorer tabs share one window; only the visible tab's view is the one the user sees.
            if let Ok(vh) = view.GetWindow() {
                if !IsWindowVisible(vh).as_bool() {
                    return Ok(None);
                }
            }
            let folder: IFolderView = view.cast()?;
            let items: IShellItemArray = match folder.Items(SVGIO_SELECTION) {
                Ok(i) => i,
                Err(_) => return Ok(Some(Vec::new())),
            };
            let mut out = Vec::new();
            for i in 0..items.GetCount()? {
                let item = items.GetItemAt(i)?;
                if let Ok(p) = item.GetDisplayName(SIGDN_FILESYSPATH) {
                    if let Ok(s) = p.to_string() {
                        out.push(s);
                    }
                    CoTaskMemFree(Some(p.0 as *const core::ffi::c_void));
                }
            }
            Ok(Some(out))
        }
    }

    fn browser_from(disp: &windows::core::IUnknown) -> windows::core::Result<IShellBrowser> {
        let sp: IServiceProvider = disp.cast()?;
        // SAFETY: QueryService with a valid service GUID.
        unsafe { sp.QueryService::<IShellBrowser>(&SID_STopLevelBrowser) }
    }

    fn read() -> windows::core::Result<Option<Selection>> {
        // SAFETY: Win32/COM calls on this STA thread.
        unsafe {
            let fg = GetForegroundWindow();
            if fg.is_invalid() {
                return Ok(None);
            }
            let root = GetAncestor(fg, GA_ROOT);
            let class = class_of(root);
            let windows: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_ALL)?;

            if class == "Progman" || class == "WorkerW" {
                let mut hwnd = 0i32;
                let loc = var_i4(0); // CSIDL_DESKTOP
                let root_loc = VARIANT::default();
                let disp = windows.FindWindowSW(&loc, &root_loc, SWC_DESKTOP, &mut hwnd, SWFO_NEEDDISPATCH)?;
                let browser = browser_from(&disp.cast()?)?;
                return Ok(selection_of(&browser)?
                    .filter(|p| !p.is_empty())
                    .map(|paths| Selection { source: Source::Desktop, paths }));
            }

            if class != "CabinetWClass" {
                return Ok(None);
            }
            for i in 0..windows.Count()? {
                let Ok(disp) = windows.Item(&var_i4(i)) else { continue };
                let Ok(app) = disp.cast::<IWebBrowserApp>() else { continue };
                let Ok(h) = app.HWND() else { continue };
                if h.0 != root.0 as isize {
                    continue;
                }
                let Ok(browser) = browser_from(&disp.cast()?) else { continue };
                if let Ok(Some(paths)) = selection_of(&browser) {
                    if paths.is_empty() {
                        return Ok(None);
                    }
                    return Ok(Some(Selection { source: Source::Explorer, paths }));
                }
            }
            Ok(None)
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Reply;
    use std::sync::mpsc::Receiver;
    pub fn serve(rx: Receiver<Reply>) {
        while let Ok(reply) = rx.recv() {
            let _ = reply.send(None);
        }
    }
}
