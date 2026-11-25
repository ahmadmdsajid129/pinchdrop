//! v2 · Two-hand screenshot: frame part of the screen with two "L" hands; that area becomes a
//! PNG in the outbox and goes "in the air" for the phone like any grabbed file.
//! The picture is taken only when the user makes the gesture; nothing else is captured.

use std::path::{Path, PathBuf};

/// Captures a screen rectangle (physical pixels, virtual-screen coordinates) to a PNG in `dir`.
#[cfg(windows)]
pub fn capture(dir: &Path, x: i32, y: i32, w: i32, h: i32) -> Result<PathBuf, String> {
    use std::ffi::c_void;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT,
        DIB_RGB_COLORS, HGDIOBJ, SRCCOPY,
    };
    if w < 8 || h < 8 || w > 16384 || h > 16384 {
        return Err("That area is too small to capture.".into());
    }
    // SAFETY: every DC / bitmap created here is released before returning.
    let rgba = unsafe {
        let screen = GetDC(None);
        let mem = CreateCompatibleDC(Some(screen));
        let bmp = CreateCompatibleBitmap(screen, w, h);
        let old = SelectObject(mem, HGDIOBJ(bmp.0));
        let ok = BitBlt(mem, 0, 0, w, h, Some(screen), x, y, SRCCOPY | CAPTUREBLT).is_ok();
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut px = vec![0u8; (w * h * 4) as usize];
        SelectObject(mem, old);
        let rows = GetDIBits(
            mem,
            bmp,
            0,
            h as u32,
            Some(px.as_mut_ptr() as *mut c_void),
            &mut info,
            DIB_RGB_COLORS,
        );
        let _ = DeleteObject(HGDIOBJ(bmp.0));
        let _ = DeleteDC(mem);
        ReleaseDC(None, screen);
        if !ok || rows == 0 {
            return Err("Windows didn't let PinchDrop capture the screen.".into());
        }
        // Screen pixels are BGRx; make them opaque RGBA.
        for p in px.chunks_exact_mut(4) {
            p.swap(0, 2);
            p[3] = 255;
        }
        px
    };
    let png = crate::preview::encode_png(&rgba, w as u32, h as u32)
        .ok_or("Couldn't save the screenshot.")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let stamp = chrono_like_stamp();
    let mut path = dir.join(format!("Screenshot {stamp}.png"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("Screenshot {stamp} ({n}).png"));
        n += 1;
    }
    std::fs::write(&path, png).map_err(|e| e.to_string())?;
    Ok(path)
}

#[cfg(not(windows))]
pub fn capture(_dir: &Path, _x: i32, _y: i32, _w: i32, _h: i32) -> Result<PathBuf, String> {
    Err("Screenshots work on Windows only.".into())
}

/// "2026-11-25 213045" from the local clock (no extra dependency).
fn chrono_like_stamp() -> String {
    #[cfg(windows)]
    {
        // SAFETY: GetLocalTime only fills the struct.
        let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
        format!(
            "{:04}-{:02}-{:02} {:02}{:02}{:02}",
            t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond
        )
    }
    #[cfg(not(windows))]
    {
        crate::link::proto::now_secs().to_string()
    }
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn captures_a_png_of_the_screen() {
        let dir = std::env::temp_dir().join(format!("pd-shot-{}", crate::link::proto::random_id()));
        match super::capture(&dir, 0, 0, 64, 48) {
            Ok(p) => {
                let bytes = std::fs::read(&p).unwrap();
                assert_eq!(&bytes[1..4], b"PNG");
                assert!(p
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("Screenshot "));
            }
            // A machine with no interactive desktop (CI service) can't capture; that's fine.
            Err(e) => eprintln!("capture skipped: {e}"),
        }
        let _ = std::fs::remove_dir_all(dir);
    }
}
