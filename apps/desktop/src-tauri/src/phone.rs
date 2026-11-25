//! What the PC knows about the paired phone. Phase 1 has no real connection
//! yet, so the status is either "none" or, when the demo setting is on, a
//! clearly labelled pretend phone used to preview the pill and Island.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PhoneStatus {
    /// "none" | "connected" | "offline"
    pub state: String,
    pub name: Option<String>,
    pub model: Option<String>,
    pub battery: Option<u8>,
    pub charging: bool,
    pub network: Option<String>,
    pub free_space_gb: Option<u32>,
    pub is_demo: bool,
}

impl PhoneStatus {
    pub fn none() -> Self {
        Self {
            state: "none".into(),
            name: None,
            model: None,
            battery: None,
            charging: false,
            network: None,
            free_space_gb: None,
            is_demo: false,
        }
    }

    pub fn demo() -> Self {
        Self {
            state: "connected".into(),
            name: Some("Demo phone".into()),
            model: Some("Preview only · not a real connection".into()),
            battery: Some(78),
            charging: true,
            network: Some("Same Wi-Fi".into()),
            free_space_gb: Some(82),
            is_demo: true,
        }
    }

    pub fn current(demo_enabled: bool) -> Self {
        if demo_enabled {
            Self::demo()
        } else {
            Self::none()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn demo_is_marked_and_none_is_empty() {
        assert!(PhoneStatus::current(true).is_demo);
        assert_eq!(PhoneStatus::current(false).state, "none");
        assert!(PhoneStatus::current(false).name.is_none());
    }
}
