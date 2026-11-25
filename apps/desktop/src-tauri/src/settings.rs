//! Persistent user settings, stored as JSON in the app config folder.
//! The frontend reads them with `get_settings` and changes them with
//! `update_settings` (a partial JSON patch). Every change is broadcast as a
//! `settings-changed` event so both windows stay in sync.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct PillSettings {
    pub visible: bool,
    /// Saved top-left position in physical pixels. `None` = default (top centre).
    pub x: Option<i32>,
    pub y: Option<i32>,
    /// Which side of the pill stays put when it grows into the Island.
    pub anchor_h: String, // "left" | "center" | "right"
    pub anchor_v: String, // "top" | "bottom"
    pub shows: String,    // "name_battery" | "battery" | "dot"
    pub size: String,     // "s" | "m" | "l"
    pub island_auto_close_secs: u32, // 0 = never
    pub hide_in_fullscreen: bool,
}

impl Default for PillSettings {
    fn default() -> Self {
        Self {
            visible: true,
            x: None,
            y: None,
            anchor_h: "center".into(),
            anchor_v: "top".into(),
            shows: "name_battery".into(),
            size: "m".into(),
            island_auto_close_secs: 4,
            hide_in_fullscreen: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct GestureSettings {
    pub enabled: bool,
    pub camera_id: Option<String>,
    pub camera_mode: String, // "on_click" (default) | "hotkey" | "on_select"
    pub sensitivity: u8,     // 0..=100
    pub catch_secs: u32,
    pub show_hand_ring: bool,
    pub sounds: bool,
}

impl Default for GestureSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            camera_id: None,
            camera_mode: "on_click".into(),
            sensitivity: 55,
            catch_secs: 30,
            show_hand_ring: true,
            sounds: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct TransferSettings {
    pub mode: String,       // "copy" | "move"
    pub name_clash: String, // "keep_both" | "replace"
    pub auto_resume: bool,
    pub open_first: bool,
}

impl Default for TransferSettings {
    fn default() -> Self {
        Self {
            mode: "copy".into(),
            name_clash: "keep_both".into(),
            auto_resume: true,
            open_first: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationSettings {
    pub on_finish: bool,
    pub on_disconnect: bool,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self { on_finish: true, on_disconnect: false }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ProfileSettings {
    pub pc_name: String,
    pub avatar_color: String,
}

impl Default for ProfileSettings {
    fn default() -> Self {
        let name = std::env::var("COMPUTERNAME")
            .ok()
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| "My PC".to_string());
        Self { pc_name: name, avatar_color: "#22D3EE".into() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub onboarded: bool,
    pub keep_running_on_close: bool,
    pub theme: String,  // "dark" | "light" | "system"
    pub motion: String, // "system" | "full" | "reduced"
    pub pill: PillSettings,
    pub gestures: GestureSettings,
    pub transfers: TransferSettings,
    pub notifications: NotificationSettings,
    pub crash_reports: bool,
    pub profile: ProfileSettings,
    /// Shows a pretend phone so the pill and Island can be previewed before
    /// real pairing exists (Phase 3). Off by default.
    pub demo_phone: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            onboarded: false,
            keep_running_on_close: true,
            theme: "dark".into(),
            motion: "system".into(),
            pill: PillSettings::default(),
            gestures: GestureSettings::default(),
            transfers: TransferSettings::default(),
            notifications: NotificationSettings::default(),
            crash_reports: false,
            profile: ProfileSettings::default(),
            demo_phone: false,
        }
    }
}

pub fn settings_path(config_dir: &Path) -> PathBuf {
    config_dir.join("settings.json")
}

/// Loads settings; a missing or unreadable file yields defaults.
pub fn load(path: &Path) -> Settings {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Writes atomically (temp file + rename) so a crash never leaves half a file.
pub fn save(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("create config dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("write settings: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("save settings: {e}"))
}

/// Deep-merges `patch` into `base` (objects merge key by key, everything else replaces).
pub fn merge(base: &mut Value, patch: &Value) {
    match (base, patch) {
        (Value::Object(b), Value::Object(p)) => {
            for (k, v) in p {
                merge(b.entry(k.clone()).or_insert(Value::Null), v);
            }
        }
        (b, p) => *b = p.clone(),
    }
}

/// Applies a partial patch and returns the new settings, rejecting patches
/// that would produce an invalid structure.
pub fn apply_patch(current: &Settings, patch: &Value) -> Result<Settings, String> {
    let mut value = serde_json::to_value(current).map_err(|e| e.to_string())?;
    merge(&mut value, patch);
    serde_json::from_value(value).map_err(|e| format!("invalid settings: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn patch_changes_only_named_fields() {
        let s = Settings::default();
        let next = apply_patch(&s, &json!({"pill": {"size": "l"}, "demoPhone": true})).unwrap();
        assert_eq!(next.pill.size, "l");
        assert!(next.demo_phone);
        assert_eq!(next.pill.shows, s.pill.shows);
        assert_eq!(next.gestures, s.gestures);
    }

    #[test]
    fn bad_patch_is_rejected() {
        let s = Settings::default();
        assert!(apply_patch(&s, &json!({"pill": {"visible": "yes"}})).is_err());
    }

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let s: Settings = serde_json::from_str(r#"{"onboarded": true}"#).unwrap();
        assert!(s.onboarded);
        assert_eq!(s.pill, PillSettings::default());
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir = std::env::temp_dir().join(format!("pd_settings_{}", std::process::id()));
        let path = settings_path(&dir);
        let mut s = Settings::default();
        s.profile.pc_name = "Test PC".into();
        save(&path, &s).unwrap();
        assert_eq!(load(&path), s);
        let _ = fs::remove_dir_all(dir);
    }
}
