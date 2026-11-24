use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QrPairingPayload {
    pub device_id: String,
    pub device_name: String,
    pub public_key: String,
    pub cert_fingerprint: String,
    pub nonce: String,
    pub addresses: Vec<String>,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairedDevice {
    pub device_id: String,
    pub name: String,
    pub public_key: String,
    pub cert_fingerprint: String,
    pub paired_at_ms: u64,
    pub is_revoked: bool,
}

pub struct KeyStore {
    paired_devices: HashMap<String, PairedDevice>,
}

impl KeyStore {
    pub fn new() -> Self {
        Self {
            paired_devices: HashMap::new(),
        }
    }

    pub fn add_device(&mut self, device: PairedDevice) {
        self.paired_devices.insert(device.device_id.clone(), device);
    }

    pub fn is_trusted(&self, device_id: &str, fingerprint: &str) -> bool {
        if let Some(device) = self.paired_devices.get(device_id) {
            !device.is_revoked && device.cert_fingerprint == fingerprint
        } else {
            false
        }
    }

    pub fn revoke_device(&mut self, device_id: &str) -> bool {
        if let Some(device) = self.paired_devices.get_mut(device_id) {
            device.is_revoked = true;
            true
        } else {
            false
        }
    }

    pub fn list_devices(&self) -> Vec<PairedDevice> {
        self.paired_devices.values().cloned().collect()
    }
}
