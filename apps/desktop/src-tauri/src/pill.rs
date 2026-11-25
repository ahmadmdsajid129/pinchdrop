//! The always-on-top pill window: placement, resizing into the Island while
//! keeping its anchored side still, snapping to screen edges after a drag,
//! and hiding while a full-screen app is in front.

use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// Gap between the pill and the screen edge it is snapped to.
pub const EDGE_GAP: i32 = 8;
/// How close (physical px) a drag must end to an edge to snap to it.
pub const SNAP_DISTANCE: i32 = 40;

/// Where a window of `w`×`h` goes when it first appears: top centre.
pub fn default_position(work: Rect, w: i32, h: i32) -> (i32, i32) {
    (work.x + (work.w - w) / 2, work.y + EDGE_GAP)
}

/// New top-left for a window resized from `old` to `w`×`h` so that the
/// anchored side stays where it was (e.g. top-centre stays top-centre).
pub fn anchored_position(old: Rect, w: i32, h: i32, anchor_h: &str, anchor_v: &str) -> (i32, i32) {
    let x = match anchor_h {
        "left" => old.x,
        "right" => old.x + old.w - w,
        _ => old.x + (old.w - w) / 2,
    };
    let y = match anchor_v {
        "bottom" => old.y + old.h - h,
        _ => old.y,
    };
    (x, y)
}

/// Keeps a `w`×`h` window at (x, y) fully inside `work`.
pub fn clamp_into(work: Rect, x: i32, y: i32, w: i32, h: i32) -> (i32, i32) {
    let max_x = (work.x + work.w - w).max(work.x);
    let max_y = (work.y + work.h - h).max(work.y);
    (x.clamp(work.x, max_x), y.clamp(work.y, max_y))
}

/// After a drag ends: pull the window onto any edge it is close to and decide
/// which side should stay fixed when it grows. Returns (x, y, anchor_h, anchor_v).
pub fn snap(work: Rect, r: Rect) -> (i32, i32, &'static str, &'static str) {
    let (mut x, mut y) = clamp_into(work, r.x, r.y, r.w, r.h);

    let center_x = x + r.w / 2;
    let work_center = work.x + work.w / 2;
    let anchor_h = if (center_x - work_center).abs() <= SNAP_DISTANCE {
        x = work_center - r.w / 2;
        "center"
    } else if x - work.x <= SNAP_DISTANCE {
        x = work.x + EDGE_GAP;
        "left"
    } else if work.x + work.w - (x + r.w) <= SNAP_DISTANCE {
        x = work.x + work.w - r.w - EDGE_GAP;
        "right"
    } else if center_x < work_center {
        "left"
    } else {
        "right"
    };

    let anchor_v = if y - work.y <= SNAP_DISTANCE {
        y = work.y + EDGE_GAP;
        "top"
    } else if work.y + work.h - (y + r.h) <= SNAP_DISTANCE {
        y = work.y + work.h - r.h - EDGE_GAP;
        "bottom"
    } else if y + r.h / 2 < work.y + work.h / 2 {
        "top"
    } else {
        "bottom"
    };

    (x, y, anchor_h, anchor_v)
}

pub fn outer_rect(win: &WebviewWindow) -> Option<Rect> {
    let p = win.outer_position().ok()?;
    let s = win.outer_size().ok()?;
    Some(Rect { x: p.x, y: p.y, w: s.width as i32, h: s.height as i32 })
}

/// Work area (screen minus taskbar) of the monitor the window is on,
/// falling back to the primary monitor.
pub fn work_area(win: &WebviewWindow) -> Option<Rect> {
    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| win.primary_monitor().ok().flatten())?;
    let wa = monitor.work_area();
    Some(Rect {
        x: wa.position.x,
        y: wa.position.y,
        w: wa.size.width as i32,
        h: wa.size.height as i32,
    })
}

pub fn set_rect(win: &WebviewWindow, x: i32, y: i32, w: i32, h: i32) {
    let _ = win.set_size(PhysicalSize::new(w.max(1) as u32, h.max(1) as u32));
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

/// Is a full-screen game, video or presentation in front right now?
#[cfg(windows)]
pub fn fullscreen_app_active() -> bool {
    use windows_sys::Win32::UI::Shell::SHQueryUserNotificationState;
    let mut state: i32 = 0;
    // QUNS_BUSY = 2, QUNS_RUNNING_D3D_FULL_SCREEN = 3, QUNS_PRESENTATION_MODE = 4
    let hr = unsafe { SHQueryUserNotificationState(&mut state) };
    hr == 0 && matches!(state, 2..=4)
}

#[cfg(not(windows))]
pub fn fullscreen_app_active() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORK: Rect = Rect { x: 0, y: 0, w: 1920, h: 1040 };

    #[test]
    fn default_is_top_centre() {
        assert_eq!(default_position(WORK, 200, 40), (860, EDGE_GAP));
    }

    #[test]
    fn growing_from_top_centre_keeps_centre_and_top() {
        let old = Rect { x: 860, y: 8, w: 200, h: 40 };
        let (x, y) = anchored_position(old, 460, 200, "center", "top");
        assert_eq!(x + 230, old.x + 100);
        assert_eq!(y, 8);
    }

    #[test]
    fn growing_from_bottom_right_keeps_that_corner() {
        let old = Rect { x: 1700, y: 990, w: 200, h: 40 };
        let (x, y) = anchored_position(old, 460, 200, "right", "bottom");
        assert_eq!(x + 460, 1900);
        assert_eq!(y + 200, 1030);
    }

    #[test]
    fn snaps_to_top_centre_when_close() {
        let (x, y, h, v) = snap(WORK, Rect { x: 870, y: 20, w: 200, h: 40 });
        assert_eq!((x, y, h, v), (860, EDGE_GAP, "center", "top"));
    }

    #[test]
    fn snaps_to_bottom_left_corner() {
        let (x, y, h, v) = snap(WORK, Rect { x: 15, y: 985, w: 200, h: 40 });
        assert_eq!((h, v), ("left", "bottom"));
        assert_eq!((x, y), (EDGE_GAP, 1040 - 40 - EDGE_GAP));
    }

    #[test]
    fn free_spot_is_kept_but_clamped_on_screen() {
        let (x, y, _, _) = snap(WORK, Rect { x: 500, y: 500, w: 200, h: 40 });
        assert_eq!((x, y), (500, 500));
        let (x, y, _, _) = snap(WORK, Rect { x: -300, y: 2000, w: 200, h: 40 });
        assert!(x >= 0 && y + 40 <= 1040);
    }
}
