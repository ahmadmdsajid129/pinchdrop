//! What the PC keeps on disk for the link: its TLS identity and the list of
//! paired phones. Both live in the app config folder and are written atomically.

use super::proto::{b64, fingerprint, random_bytes, random_id, unb64};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- identity

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdentityFile {
    pc_id: String,
    cert_der: String,
    key_der: String,
}

/// The PC's long-lived TLS identity. The phone pins `fingerprint`.
#[derive(Clone)]
pub struct Identity {
    pub pc_id: String,
    pub cert_der: Vec<u8>,
    pub key_der: Vec<u8>,
    pub fingerprint: String,
}

pub fn identity_path(config_dir: &Path) -> PathBuf {
    config_dir.join("link_identity.json")
}

fn generate_identity() -> Result<Identity, String> {
    let key = rcgen::KeyPair::generate().map_err(|e| e.to_string())?;
    let mut params = rcgen::CertificateParams::new(vec!["pinchdrop.local".to_string()])
        .map_err(|e| e.to_string())?;
    params
        .distinguished_name
        .push(rcgen::DnType::CommonName, "PinchDrop PC");
    // Valid for a long time: the phone pins the fingerprint, not the dates.
    params.not_before = rcgen::date_time_ymd(2024, 1, 1);
    params.not_after = rcgen::date_time_ymd(2049, 12, 31);
    let cert = params.self_signed(&key).map_err(|e| e.to_string())?;
    let cert_der = cert.der().to_vec();
    Ok(Identity {
        pc_id: random_id(),
        fingerprint: fingerprint(&cert_der),
        cert_der,
        key_der: key.serialize_der(),
    })
}

/// Loads the identity, creating and saving a new one the first time.
pub fn load_or_create_identity(config_dir: &Path) -> Result<Identity, String> {
    let path = identity_path(config_dir);
    if let Ok(text) = std::fs::read_to_string(&path) {
        if let Ok(f) = serde_json::from_str::<IdentityFile>(&text) {
            if let (Some(cert_der), Some(key_der)) = (unb64(&f.cert_der), unb64(&f.key_der)) {
                return Ok(Identity {
                    pc_id: f.pc_id,
                    fingerprint: fingerprint(&cert_der),
                    cert_der,
                    key_der,
                });
            }
        }
    }
    let id = generate_identity()?;
    let file = IdentityFile {
        pc_id: id.pc_id.clone(),
        cert_der: b64(&id.cert_der),
        key_der: b64(&id.key_der),
    };
    write_atomic(
        &path,
        serde_json::to_string_pretty(&file)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )?;
    Ok(id)
}

// ---------------------------------------------------------------- devices

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    pub id: String,
    pub name: String,
    pub model: String,
    /// base64 of the 32-byte shared secret.
    pub secret: String,
    pub paired_at: u64,
    pub last_seen: u64,
}

impl PairedDevice {
    pub fn new(name: &str, model: &str, now: u64) -> Self {
        Self {
            id: random_id(),
            name: name.to_string(),
            model: model.to_string(),
            secret: b64(&random_bytes::<32>()),
            paired_at: now,
            last_seen: now,
        }
    }

    pub fn secret_bytes(&self) -> Vec<u8> {
        unb64(&self.secret).unwrap_or_default()
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Devices {
    pub devices: Vec<PairedDevice>,
}

pub fn devices_path(config_dir: &Path) -> PathBuf {
    config_dir.join("devices.json")
}

impl Devices {
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        write_atomic(
            path,
            serde_json::to_string_pretty(self)
                .map_err(|e| e.to_string())?
                .as_bytes(),
        )
    }

    pub fn get(&self, id: &str) -> Option<&PairedDevice> {
        self.devices.iter().find(|d| d.id == id)
    }

    pub fn add(&mut self, d: PairedDevice) {
        self.devices.retain(|x| x.id != d.id);
        self.devices.push(d);
    }

    pub fn remove(&mut self, id: &str) -> bool {
        let before = self.devices.len();
        self.devices.retain(|d| d.id != id);
        before != self.devices.len()
    }

    pub fn touch(&mut self, id: &str, name: Option<&str>, model: Option<&str>, now: u64) {
        if let Some(d) = self.devices.iter_mut().find(|d| d.id == id) {
            d.last_seen = now;
            if let Some(n) = name.filter(|n| !n.trim().is_empty()) {
                d.name = n.chars().take(40).collect();
            }
            if let Some(m) = model.filter(|m| !m.trim().is_empty()) {
                d.model = m.chars().take(60).collect();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("pd-link-{tag}-{}", random_id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn identity_is_created_once_and_reloaded() {
        let dir = tmp_dir("id");
        let a = load_or_create_identity(&dir).unwrap();
        let b = load_or_create_identity(&dir).unwrap();
        assert_eq!(a.pc_id, b.pc_id);
        assert_eq!(a.fingerprint, b.fingerprint);
        assert_eq!(a.fingerprint.len(), 64);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn devices_round_trip() {
        let dir = tmp_dir("dev");
        let path = devices_path(&dir);
        let mut ds = Devices::default();
        let d = PairedDevice::new("Pixel 8", "Google Pixel 8", 100);
        let id = d.id.clone();
        ds.add(d);
        ds.touch(&id, Some("My Pixel"), None, 200);
        ds.save(&path).unwrap();
        let loaded = Devices::load(&path);
        assert_eq!(loaded.devices.len(), 1);
        assert_eq!(loaded.get(&id).unwrap().name, "My Pixel");
        assert_eq!(loaded.get(&id).unwrap().last_seen, 200);
        assert_eq!(loaded.get(&id).unwrap().secret_bytes().len(), 32);
        let mut l2 = loaded;
        assert!(l2.remove(&id));
        assert!(!l2.remove(&id));
        let _ = std::fs::remove_dir_all(dir);
    }
}
