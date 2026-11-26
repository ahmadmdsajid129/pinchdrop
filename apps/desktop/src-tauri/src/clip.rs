//! Text and links from the clipboard (v1.1): what a pinch sends when nothing is selected in
//! Explorer, and how text is packaged.
//!
//! * a single link → sent as a link; the phone opens it
//! * a short note → sent as text; lands on the phone's clipboard
//! * a long text → written to a `.txt` file (exact text, line breaks kept) and sent as a file
//! * formatted text (Word, web pages) → an `.html` file so bold, lists and links survive

use std::path::{Path, PathBuf};

/// Longer than this (or more than a few lines) and text travels as a file.
const SHORT_MAX_CHARS: usize = 500;
const SHORT_MAX_LINES: usize = 3;

#[derive(Debug, Clone, PartialEq)]
pub enum TextPlan {
    Link(String),
    Short(String),
    Long(String),
}

pub fn is_link(s: &str) -> bool {
    let t = s.trim();
    (t.starts_with("https://") || t.starts_with("http://"))
        && !t.chars().any(char::is_whitespace)
        && t.len() < 4096
}

pub fn classify(text: &str) -> TextPlan {
    let t = text.trim_matches(|c| c == '\u{feff}' || c == '\0');
    if is_link(t) {
        return TextPlan::Link(t.trim().to_string());
    }
    if t.chars().count() <= SHORT_MAX_CHARS && t.lines().count() <= SHORT_MAX_LINES {
        TextPlan::Short(t.trim().to_string())
    } else {
        TextPlan::Long(t.to_string())
    }
}

/// A readable file name from the first words: "Note - Meeting notes for Tuesday.txt".
pub fn note_name(text: &str, ext: &str) -> String {
    let words: Vec<String> = text
        .split_whitespace()
        .take(6)
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '\'')
                .collect::<String>()
        })
        .filter(|w| !w.is_empty())
        .collect();
    let mut stem = words.join(" ");
    if stem.chars().count() > 48 {
        stem = stem
            .chars()
            .take(48)
            .collect::<String>()
            .trim_end()
            .to_string();
    }
    if stem.is_empty() {
        stem = "Note".into();
    }
    format!("Note - {stem}.{ext}")
}

/// Writes a long text (or its formatted HTML) into `dir` and returns the path.
/// Text keeps its exact characters and line breaks (UTF-8, with a BOM so Windows tools agree).
pub fn write_note(dir: &Path, text: &str, html: Option<&str>) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let (name, bytes) = match html {
        Some(h) => (
            note_name(text, "html"),
            format!("<!doctype html>\n<html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>{}</title></head>\n<body>\n{h}\n</body></html>\n", escape(&note_name(text, "")).trim_end_matches('.'))
                .into_bytes(),
        ),
        None => {
            let mut b = vec![0xEF, 0xBB, 0xBF];
            b.extend_from_slice(text.as_bytes());
            (note_name(text, "txt"), b)
        }
    };
    let mut path = dir.join(&name);
    let mut n = 2;
    while path.exists() {
        let (stem, ext) = name.rsplit_once('.').unwrap_or((&name, "txt"));
        path = dir.join(format!("{stem} ({n}).{ext}"));
        n += 1;
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Removes notes older than two days from the outbox (they've been sent long ago).
pub fn tidy_outbox(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(2 * 24 * 3600);
    for e in entries.flatten() {
        if let Ok(m) = e.metadata() {
            let old = m.modified().map(|t| t < cutoff).unwrap_or(false);
            if m.is_file() && old {
                let _ = std::fs::remove_file(e.path());
            } else if m.is_dir() && old && e.file_name().to_string_lossy().starts_with("relay-") {
                // A phone → phone copy that never got cleaned up (send failed, app closed…).
                let _ = std::fs::remove_dir_all(e.path());
            }
        }
    }
}

/// The "HTML Format" clipboard payload → just the copied fragment.
pub fn html_fragment(cf_html: &str) -> Option<String> {
    let num = |key: &str| -> Option<usize> {
        let i = cf_html.find(key)? + key.len();
        cf_html[i..].lines().next()?.trim().parse().ok()
    };
    let (s, e) = (num("StartFragment:")?, num("EndFragment:")?);
    // Offsets are in bytes of the UTF-8 payload.
    let bytes = cf_html.as_bytes();
    if s < e && e <= bytes.len() {
        Some(String::from_utf8_lossy(&bytes[s..e]).into_owned())
    } else {
        None
    }
}

/// Does this HTML carry real formatting (not just one plain span)?
pub fn is_rich(html: &str) -> bool {
    let h = html.to_ascii_lowercase();
    [
        "<b>", "<strong", "<i>", "<em", "<ul", "<ol", "<li", "<h1", "<h2", "<h3", "<table", "<a ",
        "<br", "<p",
    ]
    .iter()
    .filter(|t| h.contains(*t))
    .count()
        >= 2
}

/// What's on the clipboard right now: (plain text, formatted HTML fragment if any).
#[cfg(windows)]
pub fn read() -> Option<(String, Option<String>)> {
    use windows::core::w;
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
        RegisterClipboardFormatW,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
    use windows::Win32::System::Ole::CF_UNICODETEXT;

    // SAFETY: standard clipboard read; every lock is unlocked and the clipboard is closed.
    unsafe {
        let mut opened = false;
        for _ in 0..5 {
            if OpenClipboard(None).is_ok() {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        if !opened {
            return None;
        }
        let read_bytes = |fmt: u32| -> Option<Vec<u8>> {
            IsClipboardFormatAvailable(fmt).ok()?;
            let h = GetClipboardData(fmt).ok()?;
            let g = HGLOBAL(h.0);
            let p = GlobalLock(g) as *const u8;
            if p.is_null() {
                return None;
            }
            let n = GlobalSize(g);
            let v = std::slice::from_raw_parts(p, n).to_vec();
            let _ = GlobalUnlock(g);
            Some(v)
        };
        let text = read_bytes(CF_UNICODETEXT.0 as u32).map(|b| {
            let u: Vec<u16> = b
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .take_while(|&c| c != 0)
                .collect();
            String::from_utf16_lossy(&u)
        });
        let html_fmt = RegisterClipboardFormatW(w!("HTML Format"));
        let html = read_bytes(html_fmt)
            .map(|b| {
                String::from_utf8_lossy(&b)
                    .trim_end_matches('\0')
                    .to_string()
            })
            .and_then(|s| html_fragment(&s));
        let _ = CloseClipboard();
        let text = text.filter(|t| !t.trim().is_empty())?;
        Some((text, html.filter(|h| is_rich(h))))
    }
}

#[cfg(not(windows))]
pub fn read() -> Option<(String, Option<String>)> {
    None
}

/// Puts plain text on the PC clipboard (a note lifted from the phone). True on success.
#[cfg(windows)]
pub fn write(text: &str) -> bool {
    use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::CF_UNICODETEXT;

    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY: the buffer is sized for the text plus NUL; ownership passes to the clipboard on
    // success, otherwise it is freed here; the clipboard is always closed.
    unsafe {
        let mut opened = false;
        for _ in 0..5 {
            if OpenClipboard(None).is_ok() {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        if !opened {
            return false;
        }
        let ok = (|| -> Option<()> {
            EmptyClipboard().ok()?;
            let h: HGLOBAL = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2).ok()?;
            let p = GlobalLock(h) as *mut u16;
            if p.is_null() {
                let _ = GlobalFree(Some(h));
                return None;
            }
            std::ptr::copy_nonoverlapping(wide.as_ptr(), p, wide.len());
            let _ = GlobalUnlock(h);
            if SetClipboardData(CF_UNICODETEXT.0 as u32, Some(HANDLE(h.0))).is_err() {
                let _ = GlobalFree(Some(h));
                return None;
            }
            Some(())
        })()
        .is_some();
        let _ = CloseClipboard();
        ok
    }
}

#[cfg(not(windows))]
pub fn write(_text: &str) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_links_short_and_long_text() {
        assert_eq!(
            classify("  https://example.com/a?b=1 \n"),
            TextPlan::Link("https://example.com/a?b=1".into())
        );
        assert!(matches!(classify("buy milk"), TextPlan::Short(_)));
        assert!(matches!(classify("a\nb\nc\nd"), TextPlan::Long(_)));
        assert!(matches!(classify(&"x".repeat(600)), TextPlan::Long(_)));
        assert!(matches!(
            classify("see https://example.com later"),
            TextPlan::Short(_)
        ));
    }

    #[test]
    fn note_names_are_readable_and_safe() {
        assert_eq!(
            note_name("Meeting notes: Tuesday / room 4", "txt"),
            "Note - Meeting notes Tuesday room 4.txt"
        );
        assert_eq!(note_name("   ", "txt"), "Note - Note.txt");
    }

    #[test]
    fn long_text_keeps_every_character_and_line_break() {
        let dir = std::env::temp_dir().join(format!("pd-note-{}", crate::link::proto::random_id()));
        let text = "Line one\r\n\tIndented line two — ünïcødé ✓\r\n\r\nLast line";
        let p = write_note(&dir, text, None).unwrap();
        let bytes = std::fs::read(&p).unwrap();
        assert_eq!(&bytes[..3], &[0xEF, 0xBB, 0xBF]);
        assert_eq!(std::str::from_utf8(&bytes[3..]).unwrap(), text);
        let p2 = write_note(&dir, text, None).unwrap();
        assert_ne!(p, p2, "a second note with the same words gets its own name");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_the_html_fragment() {
        let body = "<b>Bold</b> and <i>italic</i>";
        let header = "Version:0.9\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\nStartFragment:XXXXXXXXXX\r\nEndFragment:YYYYYYYYYY\r\n";
        let pre = format!("{header}<html><body><!--StartFragment-->");
        let start = pre.len();
        let end = start + body.len();
        let doc = format!("{pre}{body}<!--EndFragment--></body></html>")
            .replace("XXXXXXXXXX", &format!("{start:010}"))
            .replace("YYYYYYYYYY", &format!("{end:010}"));
        assert_eq!(html_fragment(&doc).as_deref(), Some(body));
        assert!(is_rich(body));
        assert!(!is_rich("<span>plain</span>"));
    }
}
