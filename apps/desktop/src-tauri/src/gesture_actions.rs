//! v2 Pro · Gesture Studio: a hand gesture can press a key on the PC (next slide, play/pause,
//! mute the call's microphone…). Only the actions in `ACTIONS` exist; the page asks for one by
//! name, never for arbitrary keys, so nothing else can ever be typed this way.

/// Windows virtual-key codes used below.
mod vk {
    pub const BACK_B: u16 = 0x42; // "B": black screen in PowerPoint / Google Slides
    pub const D: u16 = 0x44;
    pub const K: u16 = 0x4B;
    pub const S: u16 = 0x53;
    pub const TAB: u16 = 0x09;
    pub const LEFT: u16 = 0x25;
    pub const RIGHT: u16 = 0x27;
    pub const PRIOR: u16 = 0x21; // Page Up
    pub const NEXT: u16 = 0x22; // Page Down
    pub const SHIFT: u16 = 0x10;
    pub const ALT: u16 = 0x12;
    pub const LWIN: u16 = 0x5B;
    pub const VOLUME_MUTE: u16 = 0xAD;
    pub const VOLUME_DOWN: u16 = 0xAE;
    pub const VOLUME_UP: u16 = 0xAF;
    pub const MEDIA_NEXT: u16 = 0xB0;
    pub const MEDIA_PREV: u16 = 0xB1;
    pub const MEDIA_PLAY_PAUSE: u16 = 0xB3;
}

/// Every action a gesture can do: name → keys pressed together (modifiers first).
pub const ACTIONS: &[(&str, &[u16])] = &[
    ("next_slide", &[vk::RIGHT]),
    ("prev_slide", &[vk::LEFT]),
    ("black_screen", &[vk::BACK_B]),
    ("play_pause", &[vk::MEDIA_PLAY_PAUSE]),
    ("next_track", &[vk::MEDIA_NEXT]),
    ("prev_track", &[vk::MEDIA_PREV]),
    ("mute", &[vk::VOLUME_MUTE]),
    ("volume_up", &[vk::VOLUME_UP]),
    ("volume_down", &[vk::VOLUME_DOWN]),
    // Windows 11: mutes / unmutes the microphone in Teams, Zoom, Meet… (any app in a call).
    ("mic_mute", &[vk::LWIN, vk::ALT, vk::K]),
    ("show_desktop", &[vk::LWIN, vk::D]),
    ("task_view", &[vk::LWIN, vk::TAB]),
    ("snip", &[vk::LWIN, vk::SHIFT, vk::S]),
    ("page_down", &[vk::NEXT]),
    ("page_up", &[vk::PRIOR]),
];

pub fn keys_for(action: &str) -> Option<&'static [u16]> {
    ACTIONS.iter().find(|(n, _)| *n == action).map(|(_, k)| *k)
}

/// Presses the action's keys together and lets them go, like a person would.
pub fn run(action: &str) -> Result<(), String> {
    let keys = keys_for(action).ok_or("Unknown gesture action")?;
    press(keys)
}

#[cfg(windows)]
fn press(keys: &[u16]) -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        VIRTUAL_KEY,
    };
    let ev = |vk: u16, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk),
                wScan: 0,
                dwFlags: if up {
                    KEYEVENTF_KEYUP
                } else {
                    KEYBD_EVENT_FLAGS(0)
                },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let mut inputs: Vec<INPUT> = keys.iter().map(|k| ev(*k, false)).collect();
    inputs.extend(keys.iter().rev().map(|k| ev(*k, true)));
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize == inputs.len() {
        Ok(())
    } else {
        Err("Windows didn't accept the key press".into())
    }
}

#[cfg(not(windows))]
fn press(_keys: &[u16]) -> Result<(), String> {
    Err("Gesture actions work on Windows only".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_listed_actions() {
        assert!(keys_for("next_slide").is_some());
        assert!(keys_for("mic_mute").is_some());
        assert!(keys_for("type:rm -rf").is_none());
        assert!(keys_for("").is_none());
        assert!(run("nothing").is_err());
    }

    #[test]
    fn names_are_unique() {
        let mut names: Vec<_> = ACTIONS.iter().map(|(n, _)| *n).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), ACTIONS.len());
    }
}
