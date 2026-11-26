//! v2 · "Open on the other device": when a web browser is in front and you pinch (with nothing
//! selected in Explorer), the page you're looking at goes to the phone and opens there.
//! The address is read from the browser's own address bar through Windows UI Automation, the
//! accessibility interface screen readers use. Only the current tab's address is read, only at
//! the moment of the pinch.

/// Browsers whose address bar we know how to read.
const BROWSERS: [&str; 7] = [
    "chrome.exe",
    "msedge.exe",
    "brave.exe",
    "firefox.exe",
    "opera.exe",
    "vivaldi.exe",
    "arc.exe",
];

/// The address of the tab in the foreground browser window, if a browser is in front.
#[cfg(windows)]
pub fn active_url() -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::Builder::new()
        .name("pinchdrop-browser-url".into())
        .spawn(move || {
            let _ = tx.send(read());
        })
        .ok()?;
    rx.recv_timeout(std::time::Duration::from_millis(1200))
        .ok()
        .flatten()
}

#[cfg(not(windows))]
pub fn active_url() -> Option<String> {
    None
}

/// Is the foreground window a web browser?
#[cfg(windows)]
pub fn browser_in_front() -> bool {
    // SAFETY: plain Win32 queries on the foreground window.
    unsafe { foreground_exe() }.is_some_and(|exe| BROWSERS.contains(&exe.as_str()))
}

#[cfg(not(windows))]
pub fn browser_in_front() -> bool {
    false
}

#[cfg(windows)]
unsafe fn foreground_exe() -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    let hwnd = GetForegroundWindow();
    if hwnd.0.is_null() {
        return None;
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
    let mut buf = [0u16; 512];
    let mut len = buf.len() as u32;
    let ok = QueryFullProcessImageNameW(
        process,
        PROCESS_NAME_WIN32,
        PWSTR(buf.as_mut_ptr()),
        &mut len,
    )
    .is_ok();
    let _ = CloseHandle(process);
    if !ok {
        return None;
    }
    let path = String::from_utf16_lossy(&buf[..len as usize]);
    path.rsplit('\\').next().map(|s| s.to_ascii_lowercase())
}

#[cfg(windows)]
fn read() -> Option<String> {
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::Variant::VARIANT;
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationValuePattern, TreeScope_Descendants,
        UIA_ControlTypePropertyId, UIA_EditControlTypeId, UIA_ValuePatternId,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    // SAFETY: COM is initialised on this private thread and released before it ends.
    unsafe {
        if !foreground_exe().is_some_and(|exe| BROWSERS.contains(&exe.as_str())) {
            return None;
        }
        let inited = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let out = (|| {
            let uia: IUIAutomation =
                CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
            let root = uia.ElementFromHandle(GetForegroundWindow()).ok()?;
            let edit_type = VARIANT::from(UIA_EditControlTypeId.0);
            let cond = uia
                .CreatePropertyCondition(UIA_ControlTypePropertyId, &edit_type)
                .ok()?;
            // The first text box in a browser window is its address bar.
            let bar = root.FindFirst(TreeScope_Descendants, &cond).ok()?;
            let pattern: IUIAutomationValuePattern =
                bar.GetCurrentPatternAs(UIA_ValuePatternId).ok()?;
            let value = pattern.CurrentValue().ok()?.to_string();
            normalize(&value)
        })();
        if inited {
            CoUninitialize();
        }
        out
    }
}

/// "youtube.com/watch?v=x" → "https://youtube.com/watch?v=x"; search text or empty → None.
pub fn normalize(raw: &str) -> Option<String> {
    let v = raw.trim();
    if v.is_empty() || v.contains(char::is_whitespace) {
        return None;
    }
    if v.starts_with("http://") || v.starts_with("https://") {
        return Some(v.to_string());
    }
    // Browsers hide the scheme; a bare host with a dot is a web address.
    let host = v.split(['/', '?', '#']).next().unwrap_or("");
    if host.contains('.')
        && !host.starts_with('.')
        && !v.starts_with("chrome:")
        && !v.starts_with("edge:")
        && !v.starts_with("about:")
    {
        Some(format!("https://{v}"))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::normalize;

    #[test]
    fn address_bar_text_becomes_a_link() {
        assert_eq!(
            normalize("youtube.com/watch?v=abc").as_deref(),
            Some("https://youtube.com/watch?v=abc")
        );
        assert_eq!(
            normalize("https://example.com/a").as_deref(),
            Some("https://example.com/a")
        );
        assert_eq!(normalize("how to cook rice"), None);
        assert_eq!(normalize("chrome://settings"), None);
        assert_eq!(normalize(""), None);
    }
}
