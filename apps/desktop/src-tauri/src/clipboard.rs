use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardPayload {
    pub content: String,
    pub is_url: bool,
    pub source_device: String,
    pub timestamp_ms: u64,
}

pub struct AirClipboardManager {
    last_item: Option<ClipboardPayload>,
}

impl AirClipboardManager {
    pub fn new() -> Self {
        Self { last_item: None }
    }

    pub fn set_clipboard(&mut self, content: String, source_device: String) -> ClipboardPayload {
        let is_url = content.starts_with("http://") || content.starts_with("https://");
        let payload = ClipboardPayload {
            content,
            is_url,
            source_device,
            timestamp_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        };
        self.last_item = Some(payload.clone());
        payload
    }

    pub fn get_latest(&self) -> Option<&ClipboardPayload> {
        self.last_item.as_ref()
    }
}
