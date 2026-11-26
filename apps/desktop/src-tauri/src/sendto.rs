//! v2 · Explorer right-click → Send to → "PinchDrop · POCO F7": send without gestures from any
//! folder. One shortcut per paired phone in the user's own SendTo folder (no admin rights, no
//! registry). Windows 11 shows it under "Show more options". The shortcut starts PinchDrop with
//! `--send-to <device id> <files…>`; the running copy picks that up and sends.

use std::path::PathBuf;
use std::sync::Mutex;

const PREFIX: &str = "PinchDrop · ";
static LAST: Mutex<Option<Vec<(String, String)>>> = Mutex::new(None);

fn sendto_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|a| {
        PathBuf::from(a)
            .join("Microsoft")
            .join("Windows")
            .join("SendTo")
    })
}

fn file_safe(name: &str) -> String {
    let s: String = name
        .chars()
        .filter(|c| {
            !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
        })
        .collect();
    let s = s.trim().trim_end_matches('.').to_string();
    if s.is_empty() {
        "Phone".into()
    } else {
        s.chars().take(60).collect()
    }
}

/// Keeps one shortcut per device (id, name); removes ours that no longer belong.
pub fn refresh(devices: Vec<(String, String)>) {
    if let Ok(mut last) = LAST.lock() {
        if last.as_ref() == Some(&devices) {
            return;
        }
        *last = Some(devices.clone());
    }
    std::thread::Builder::new()
        .name("pinchdrop-sendto".into())
        .spawn(move || {
            let Some(dir) = sendto_dir() else { return };
            let wanted: Vec<(String, PathBuf)> = devices
                .iter()
                .map(|(id, name)| {
                    (
                        id.clone(),
                        dir.join(format!("{PREFIX}{}.lnk", file_safe(name))),
                    )
                })
                .collect();
            if let Ok(rd) = std::fs::read_dir(&dir) {
                for e in rd.flatten() {
                    let n = e.file_name().to_string_lossy().into_owned();
                    if n.starts_with(PREFIX)
                        && n.ends_with(".lnk")
                        && !wanted
                            .iter()
                            .any(|(_, p)| p.file_name() == Some(e.file_name().as_os_str()))
                    {
                        let _ = std::fs::remove_file(e.path());
                    }
                }
            }
            let Ok(exe) = std::env::current_exe() else {
                return;
            };
            for (id, path) in wanted {
                let _ = make_link(&exe, &format!("--send-to {id}"), &path);
            }
        })
        .ok();
}

#[cfg(windows)]
fn make_link(exe: &std::path::Path, args: &str, at: &std::path::Path) -> Result<(), String> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
    // SAFETY: COM initialised on this thread; the shortcut object is released when dropped.
    unsafe {
        let inited = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let r = (|| -> windows::core::Result<()> {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            link.SetPath(&HSTRING::from(exe.as_os_str()))?;
            link.SetArguments(&HSTRING::from(args))?;
            link.SetDescription(&HSTRING::from("Send with PinchDrop"))?;
            link.SetIconLocation(&HSTRING::from(exe.as_os_str()), 0)?;
            let file: IPersistFile = link.cast()?;
            file.Save(&HSTRING::from(at.as_os_str()), true)?;
            Ok(())
        })();
        if inited {
            CoUninitialize();
        }
        r.map_err(|e| e.to_string())
    }
}

#[cfg(not(windows))]
fn make_link(_exe: &std::path::Path, _args: &str, _at: &std::path::Path) -> Result<(), String> {
    Ok(())
}

/// `--send-to <id> <files…>` from a Send-to shortcut → (device id, files).
pub fn parse_args(args: &[String]) -> Option<(String, Vec<String>)> {
    let i = args.iter().position(|a| a == "--send-to")?;
    let id = args.get(i + 1)?.clone();
    let files: Vec<String> = args[i + 2..]
        .iter()
        .filter(|a| !a.starts_with("--"))
        .cloned()
        .collect();
    (!files.is_empty()).then_some((id, files))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_send_to_arguments() {
        let a: Vec<String> = ["pinchdrop.exe", "--send-to", "dev1", "C:\\a.jpg", "C:\\b"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(
            parse_args(&a),
            Some(("dev1".into(), vec!["C:\\a.jpg".into(), "C:\\b".into()]))
        );
        assert_eq!(parse_args(&["x".into()]), None);
        assert_eq!(file_safe("POCO F7: \"mine\""), "POCO F7 mine");
    }
}
