//! `pinchdrop://activate?key=…` links: the "Open in PinchDrop" button on the website's
//! thank-you page. The link only fills the key into the Pro page; the buyer still presses
//! Activate, so no web page can change the licence on its own.

use std::sync::Mutex;

const SCHEME: &str = "pinchdrop";

static PENDING: Mutex<Option<String>> = Mutex::new(None);

/// The licence key in a `pinchdrop://activate?key=…` argument, if one of `args` is such a link.
pub fn key_from_args(args: &[String]) -> Option<String> {
    args.iter().find_map(|a| key_from_url(a))
}

fn key_from_url(url: &str) -> Option<String> {
    let rest = url.trim().trim_matches('"');
    let rest = rest
        .strip_prefix("pinchdrop://")
        .or_else(|| rest.strip_prefix("pinchdrop:"))?;
    let (path, query) = rest.split_once('?')?;
    if path.trim_end_matches('/') != "activate" {
        return None;
    }
    let raw = query.split('&').find_map(|kv| kv.strip_prefix("key="))?;
    let key = urlencoding::decode(raw).ok()?.trim().to_string();
    let ok = !key.is_empty()
        && key.len() <= 2000
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.=".contains(c));
    ok.then_some(key)
}

/// Keep the key until the Pro page takes it.
pub fn set_pending(key: String) {
    if let Ok(mut g) = PENDING.lock() {
        *g = Some(key);
    }
}

/// A link's key is waiting (the window opened from a link before its page had loaded).
#[tauri::command]
pub fn link_key_waiting() -> bool {
    PENDING.lock().map(|g| g.is_some()).unwrap_or(false)
}

/// The key from the last link, once.
#[tauri::command]
pub fn take_pending_key() -> Option<String> {
    PENDING.lock().ok().and_then(|mut g| g.take())
}

/// Make Windows open `pinchdrop://` links with this exe (per user, no admin needed).
/// The Store version declares the link in its package manifest instead.
#[cfg(all(windows, not(feature = "store")))]
pub fn register() {
    use std::os::windows::process::CommandExt;
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let base = format!(r"HKCU\Software\Classes\{SCHEME}");
    let command = format!("\"{}\" \"%1\"", exe.display());
    let entries: [(&str, Option<&str>, &str); 3] = [
        (&base, None, "URL:PinchDrop"),
        (&base, Some("URL Protocol"), ""),
        (&format!(r"{base}\shell\open\command"), None, &command),
    ];
    for (key, name, data) in entries {
        let mut c = std::process::Command::new("reg");
        c.arg("add").arg(key);
        match name {
            Some(n) => c.arg("/v").arg(n),
            None => c.arg("/ve"),
        };
        let _ = c
            .args(["/t", "REG_SZ", "/d", data, "/f"])
            .creation_flags(0x0800_0000)
            .output();
    }
}

#[cfg(not(all(windows, not(feature = "store"))))]
pub fn register() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_key() {
        let a = vec![
            "PinchDrop.exe".to_string(),
            "pinchdrop://activate?key=ABCD-1234-ef".to_string(),
        ];
        assert_eq!(key_from_args(&a).as_deref(), Some("ABCD-1234-ef"));
        assert_eq!(
            key_from_url("pinchdrop://activate/?x=1&key=PD1-ab_c.d%3D").as_deref(),
            Some("PD1-ab_c.d=")
        );
    }

    #[test]
    fn ignores_anything_else() {
        assert_eq!(key_from_url("pinchdrop://delete?key=abc"), None);
        assert_eq!(key_from_url("https://activate?key=abc"), None);
        assert_eq!(key_from_url("pinchdrop://activate?key="), None);
        assert_eq!(key_from_url("pinchdrop://activate?key=a%20b"), None);
        assert_eq!(key_from_url("pinchdrop://activate?key=<script>"), None);
    }
}
