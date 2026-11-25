//! What the floating card (and the Island) shows for a grabbed item:
//!
//! * photos, videos, PDFs, Office files… → the real thumbnail Windows Explorer shows, in its true shape
//! * text files and notes → the first lines
//! * folders → what's inside
//! * links → the site and address
//! * several items → a stack, led by the first one
//!
//! Thumbnails are made on the fly in memory and travel to the overlay as a data URL; nothing is
//! written to disk.

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Longest side of a thumbnail, in pixels.
const THUMB_PX: i32 = 256;
const MAX_LINES: usize = 6;
const MAX_LINE_CHARS: usize = 90;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    /// image | video | audio | pdf | doc | sheet | slides | text | code | archive | app | file |
    /// folder | multi | link | note
    pub kind: String,
    /// `data:image/png;base64,…` when Windows has a thumbnail for it.
    #[serde(default)]
    pub thumb: Option<String>,
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    /// Text: first lines. Link: the address.
    #[serde(default)]
    pub lines: Vec<String>,
    /// Upper-case extension ("MP4"), for the badge.
    #[serde(default)]
    pub ext: String,
    /// Folder: first entries. Several items: their names.
    #[serde(default)]
    pub children: Vec<String>,
    /// Folder / several items: how many entries in total.
    #[serde(default)]
    pub child_count: u64,
    /// Link: the site ("youtube.com").
    #[serde(default)]
    pub host: String,
}

pub fn kind_for_ext(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "heic" | "heif" | "tif" | "tiff"
        | "svg" | "avif" | "ico" | "dng" | "cr2" | "cr3" | "nef" | "arw" | "raw" => "image",
        "mp4" | "mkv" | "mov" | "avi" | "webm" | "wmv" | "m4v" | "flv" | "3gp" | "mts" | "m2ts"
        | "ts" | "mpg" | "mpeg" => "video",
        "mp3" | "wav" | "flac" | "aac" | "m4a" | "ogg" | "opus" | "wma" | "aiff" => "audio",
        "pdf" => "pdf",
        "doc" | "docx" | "odt" | "rtf" | "pages" => "doc",
        "xls" | "xlsx" | "csv" | "ods" | "numbers" => "sheet",
        "ppt" | "pptx" | "odp" | "key" => "slides",
        "txt" | "md" | "log" | "ini" | "cfg" | "conf" | "srt" | "vtt" => "text",
        "json" | "xml" | "yaml" | "yml" | "toml" | "rs" | "tsx" | "jsx" | "js" | "mjs" | "py"
        | "java" | "kt" | "c" | "cpp" | "h" | "hpp" | "cs" | "go" | "rb" | "php" | "html"
        | "htm" | "css" | "scss" | "sh" | "bat" | "ps1" | "sql" | "swift" | "dart" => "code",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "iso" => "archive",
        "exe" | "msi" | "apk" | "appx" | "msix" => "app",
        _ => "file",
    }
}

fn ext_of(path: &Path) -> String {
    path.extension()
        .map(|e| e.to_string_lossy().to_ascii_uppercase())
        .unwrap_or_default()
}

/// The first few non-empty lines of a text, each kept short.
pub fn first_lines(text: &str) -> Vec<String> {
    text.trim_start_matches('\u{feff}')
        .lines()
        .map(|l| l.trim_end())
        .filter(|l| !l.trim().is_empty())
        .take(MAX_LINES)
        .map(|l| {
            let l = l.replace('\t', "    ");
            if l.chars().count() > MAX_LINE_CHARS {
                format!("{}…", l.chars().take(MAX_LINE_CHARS).collect::<String>())
            } else {
                l
            }
        })
        .collect()
}

/// Reads just the start of a text file (never the whole thing).
fn head_of_file(path: &Path) -> Vec<String> {
    use std::io::Read;
    let mut buf = vec![0u8; 4096];
    let n = std::fs::File::open(path)
        .and_then(|mut f| f.read(&mut buf))
        .unwrap_or(0);
    buf.truncate(n);
    if buf.contains(&0) {
        return Vec::new(); // binary after all
    }
    first_lines(&String::from_utf8_lossy(&buf))
}

fn folder_entries(path: &Path) -> (Vec<String>, u64) {
    let Ok(rd) = std::fs::read_dir(path) else {
        return (Vec::new(), 0);
    };
    let mut dirs = Vec::new();
    let mut files = Vec::new();
    let mut count = 0u64;
    for e in rd.flatten() {
        count += 1;
        if count > 5000 {
            break;
        }
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.')
            || name.eq_ignore_ascii_case("desktop.ini")
            || name.eq_ignore_ascii_case("thumbs.db")
        {
            continue;
        }
        if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            dirs.push(format!("{name}/"));
        } else {
            files.push(name);
        }
    }
    dirs.sort_by_key(|n| n.to_lowercase());
    files.sort_by_key(|n| n.to_lowercase());
    dirs.extend(files);
    dirs.truncate(6);
    (dirs, count)
}

/// Preview for one or more selected paths.
pub fn for_paths(paths: &[String]) -> Preview {
    let Some(first) = paths.first() else {
        return Preview::default();
    };
    let p = Path::new(first);
    let mut pv = if p.is_dir() {
        let (children, child_count) = folder_entries(p);
        Preview {
            kind: "folder".into(),
            children,
            child_count,
            ..Default::default()
        }
    } else {
        let ext = ext_of(p);
        let kind = kind_for_ext(&ext);
        let mut pv = Preview {
            kind: kind.into(),
            ext,
            ..Default::default()
        };
        match kind {
            "text" | "code" => pv.lines = head_of_file(p),
            _ => {
                if let Some((thumb, w, h)) = thumbnail(first) {
                    pv.thumb = Some(thumb);
                    pv.width = w;
                    pv.height = h;
                }
            }
        }
        pv
    };
    if paths.len() > 1 {
        // A stack: the first item's look on top, the others' names underneath.
        pv.children = paths
            .iter()
            .take(6)
            .map(|s| {
                Path::new(s)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default()
            })
            .collect();
        pv.child_count = paths.len() as u64;
        pv.lines.clear();
        pv.kind = format!("multi:{}", pv.kind);
    }
    pv
}

pub fn for_link(url: &str, host: &str) -> Preview {
    Preview {
        kind: "link".into(),
        lines: vec![url.to_string()],
        host: host.trim_start_matches("www.").to_string(),
        ..Default::default()
    }
}

pub fn for_note(text: &str) -> Preview {
    Preview {
        kind: "note".into(),
        lines: first_lines(text),
        ..Default::default()
    }
}

/// Explorer's own thumbnail (photos, video frames, PDF pages, Office documents, album art),
/// sized to fit THUMB_PX and keeping its shape. `None` when Windows has only a generic icon.
#[cfg(windows)]
pub fn thumbnail(path: &str) -> Option<(String, u32, u32)> {
    let path = path.to_string();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::Builder::new()
        .name("pinchdrop-thumb".into())
        .spawn(move || {
            let _ = tx.send(shell_thumb(&path));
        })
        .ok()?;
    // Big videos on slow disks can take a moment; the card shows an icon meanwhile.
    rx.recv_timeout(std::time::Duration::from_millis(1500))
        .ok()
        .flatten()
}

#[cfg(not(windows))]
pub fn thumbnail(_path: &str) -> Option<(String, u32, u32)> {
    None
}

#[cfg(windows)]
fn shell_thumb(path: &str) -> Option<(String, u32, u32)> {
    use base64::Engine;
    use std::ffi::c_void;
    use windows::core::HSTRING;
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{
        IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_THUMBNAILONLY,
    };

    // SAFETY: COM is initialised on this (private) thread; every GDI handle is released.
    unsafe {
        let inited = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let out = (|| {
            let factory: IShellItemImageFactory =
                SHCreateItemFromParsingName(&HSTRING::from(path), None).ok()?;
            let hbmp = factory
                .GetImage(
                    SIZE {
                        cx: THUMB_PX,
                        cy: THUMB_PX,
                    },
                    SIIGBF_THUMBNAILONLY,
                )
                .ok()?;
            let obj = HGDIOBJ(hbmp.0);
            let mut bm = BITMAP::default();
            let got = GetObjectW(
                obj,
                std::mem::size_of::<BITMAP>() as i32,
                Some(&mut bm as *mut BITMAP as *mut c_void),
            );
            let (w, h) = (bm.bmWidth, bm.bmHeight.abs());
            if got == 0 || w <= 0 || h <= 0 {
                let _ = DeleteObject(obj);
                return None;
            }
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w,
                    biHeight: -h, // top-down rows
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut px = vec![0u8; (w * h * 4) as usize];
            let dc = GetDC(None);
            let rows = GetDIBits(
                dc,
                hbmp,
                0,
                h as u32,
                Some(px.as_mut_ptr() as *mut c_void),
                &mut info,
                DIB_RGB_COLORS,
            );
            ReleaseDC(None, dc);
            let _ = DeleteObject(obj);
            if rows == 0 {
                return None;
            }
            let rgba = bgra_to_rgba(px);
            let png = encode_png(&rgba, w as u32, h as u32)?;
            Some((
                format!(
                    "data:image/png;base64,{}",
                    base64::engine::general_purpose::STANDARD.encode(png)
                ),
                w as u32,
                h as u32,
            ))
        })();
        if inited {
            CoUninitialize();
        }
        out
    }
}

/// Windows gives premultiplied BGRA, or BGRA with an all-zero alpha for opaque pictures (JPEG).
fn bgra_to_rgba(mut px: Vec<u8>) -> Vec<u8> {
    let opaque = px.chunks_exact(4).all(|p| p[3] == 0);
    for p in px.chunks_exact_mut(4) {
        p.swap(0, 2);
        if opaque {
            p[3] = 255;
        } else if p[3] > 0 && p[3] < 255 {
            let a = p[3] as u32;
            for c in &mut p[..3] {
                *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
    px
}

fn encode_png(rgba: &[u8], w: u32, h: u32) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header().ok()?;
        writer.write_image_data(rgba).ok()?;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_follow_the_extension() {
        assert_eq!(kind_for_ext("JPG"), "image");
        assert_eq!(kind_for_ext("mkv"), "video");
        assert_eq!(kind_for_ext("pdf"), "pdf");
        assert_eq!(kind_for_ext("docx"), "doc");
        assert_eq!(kind_for_ext("rs"), "code");
        assert_eq!(kind_for_ext("weird"), "file");
    }

    #[test]
    fn text_previews_keep_the_first_lines_short() {
        let long = "x".repeat(200);
        let text = format!("\u{feff}Title\n\n\tindented\n{long}\n4\n5\n6\n7");
        let l = first_lines(&text);
        assert_eq!(l.len(), MAX_LINES);
        assert_eq!(l[0], "Title");
        assert_eq!(l[1], "    indented");
        assert!(l[2].ends_with('…') && l[2].chars().count() == MAX_LINE_CHARS + 1);
    }

    #[test]
    fn folders_list_subfolders_first() {
        let dir = std::env::temp_dir().join(format!("pd-pv-{}", crate::link::proto::random_id()));
        std::fs::create_dir_all(dir.join("Zeta")).unwrap();
        std::fs::write(dir.join("a.txt"), "hello\nworld").unwrap();
        std::fs::write(dir.join("desktop.ini"), "").unwrap();
        let pv = for_paths(&[dir.to_string_lossy().into_owned()]);
        assert_eq!(pv.kind, "folder");
        assert_eq!(pv.children, vec!["Zeta/".to_string(), "a.txt".to_string()]);
        let t = for_paths(&[dir.join("a.txt").to_string_lossy().into_owned()]);
        assert_eq!(
            (t.kind.as_str(), t.lines.clone()),
            ("text", vec!["hello".to_string(), "world".to_string()])
        );
        let m = for_paths(&[
            dir.join("a.txt").to_string_lossy().into_owned(),
            dir.join("Zeta").to_string_lossy().into_owned(),
        ]);
        assert_eq!((m.kind.as_str(), m.child_count), ("multi:text", 2));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn opaque_bitmaps_get_full_alpha() {
        assert_eq!(bgra_to_rgba(vec![1, 2, 3, 0]), vec![3, 2, 1, 255]);
        assert_eq!(
            bgra_to_rgba(vec![0, 0, 64, 128, 0, 0, 0, 0]),
            vec![128, 0, 0, 128, 0, 0, 0, 0]
        );
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use super::*;

    /// A wide picture comes back as a real thumbnail that keeps its shape.
    #[test]
    fn makes_a_thumbnail_that_keeps_the_shape() {
        let dir = std::env::temp_dir().join(format!("pd-th-{}", crate::link::proto::random_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (w, h) = (400u32, 200u32);
        let px: Vec<u8> = (0..w * h).flat_map(|i| [(i % 255) as u8, 90, 200, 255]).collect();
        let file = dir.join("wide.png");
        std::fs::write(&file, encode_png(&px, w, h).unwrap()).unwrap();
        let pv = for_paths(&[file.to_string_lossy().into_owned()]);
        assert_eq!(pv.kind, "image");
        assert!(pv.thumb.as_deref().unwrap_or("").starts_with("data:image/png;base64,"), "{pv:?}");
        assert_eq!((pv.width, pv.height), (256, 128));
        let _ = std::fs::remove_dir_all(dir);
    }
}
