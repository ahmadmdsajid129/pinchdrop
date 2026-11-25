use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageItem {
    pub item_id: String,
    pub file_name: String,
    pub mime_type: String,
    pub file_size: u64,
    pub thumbnail_b64: Option<String>,
    pub received_at_ms: u64,
    pub is_caught: bool,
}

pub struct StageTrayManager {
    held_items: HashMap<String, StageItem>,
    armed_item_id: Option<String>,
    armed_timeout_ms: u64,
}

impl StageTrayManager {
    pub fn new() -> Self {
        Self {
            held_items: HashMap::new(),
            armed_item_id: None,
            armed_timeout_ms: 30_000,
        }
    }

    /// Phone dispatches hold.set -> PC enters ARMED state
    pub fn arm_item(&mut self, item: StageItem) -> String {
        let id = item.item_id.clone();
        self.held_items.insert(id.clone(), item);
        self.armed_item_id = Some(id.clone());
        id
    }

    /// User executes air catch (pinch anywhere during ARMED state)
    pub fn catch_item(&mut self, item_id: &str) -> Option<StageItem> {
        if let Some(item) = self.held_items.get_mut(item_id) {
            item.is_caught = true;
            self.armed_item_id = None;
            Some(item.clone())
        } else {
            None
        }
    }

    /// If 30 seconds elapse without a catch, un-arm and retain in Stage Tray
    pub fn timeout_armed(&mut self) {
        self.armed_item_id = None;
    }

    pub fn list_tray_items(&self) -> Vec<StageItem> {
        self.held_items.values().cloned().collect()
    }
}
