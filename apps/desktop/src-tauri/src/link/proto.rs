//! Link v1 wire format and crypto helpers. Spec: packages/protocol/LINK-v1.md.
//! Keep constants in sync with apps/android/.../link/Proto.kt.

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

pub const PROTOCOL_VERSION: u32 = 1;
pub const DEFAULT_PORT: u16 = 47821;
pub const MDNS_SERVICE: &str = "_pinchdrop._tcp.local.";
pub const WS_PATH: &str = "/link";
pub const PING_SECS: u64 = 15;
pub const SILENCE_TIMEOUT_SECS: u64 = 45;
pub const PAIR_WINDOW_SECS: u64 = 600;

const SAS_LABEL: &[u8] = b"pinchdrop-sas-v1";
const AUTH_LABEL: &[u8] = b"pinchdrop-auth-v1";

/// The standard message envelope (docs/protocol.md §1).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope {
    pub v: u32,
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub ts: u64,
    #[serde(default)]
    pub payload: Value,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn now_secs() -> u64 {
    now_ms() / 1000
}

pub fn random_bytes<const N: usize>() -> [u8; N] {
    let mut b = [0u8; N];
    rand::thread_rng().fill_bytes(&mut b);
    b
}

pub fn random_id() -> String {
    hex::encode(random_bytes::<16>())
}

pub fn b64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

pub fn unb64(s: &str) -> Option<Vec<u8>> {
    STANDARD.decode(s).ok()
}

pub fn b64url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Serialises one message ready to send as a WebSocket text frame.
pub fn message(kind: &str, payload: Value) -> String {
    let env = Envelope {
        v: PROTOCOL_VERSION,
        id: random_id(),
        kind: kind.to_string(),
        ts: now_ms(),
        payload,
    };
    serde_json::to_string(&env).unwrap_or_default()
}

pub fn parse(text: &str) -> Option<Envelope> {
    let env: Envelope = serde_json::from_str(text).ok()?;
    (env.v == PROTOCOL_VERSION).then_some(env)
}

/// SHA-256 of the certificate DER, as 64 lowercase hex characters.
pub fn fingerprint(cert_der: &[u8]) -> String {
    hex::encode(Sha256::digest(cert_der))
}

/// The 6-digit code both screens show while pairing (LINK-v1 §5).
pub fn sas_code(fingerprint_hex: &str, pc_nonce: &[u8], phone_nonce: &[u8]) -> Option<String> {
    let fp = hex::decode(fingerprint_hex).ok()?;
    if fp.len() != 32 {
        return None;
    }
    let mut h = Sha256::new();
    h.update(SAS_LABEL);
    h.update(&fp);
    h.update(pc_nonce);
    h.update(phone_nonce);
    let d = h.finalize();
    let n = u32::from_be_bytes([d[0], d[1], d[2], d[3]]) % 1_000_000;
    Some(format!("{n:06}"))
}

/// Proof that a reconnecting phone holds the secret it got at pairing.
/// The phone computes this (Proto.authProof in Kotlin); the PC only verifies, so it's used here by tests.
#[cfg_attr(not(test), allow(dead_code))]
pub fn auth_proof(secret: &[u8], pc_nonce: &[u8]) -> Vec<u8> {
    let mut mac =
        <Hmac<Sha256> as Mac>::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(AUTH_LABEL);
    mac.update(pc_nonce);
    mac.finalize().into_bytes().to_vec()
}

/// Constant-time check of a proof sent by the phone.
pub fn verify_proof(secret: &[u8], pc_nonce: &[u8], proof: &[u8]) -> bool {
    let mut mac =
        <Hmac<Sha256> as Mac>::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(AUTH_LABEL);
    mac.update(pc_nonce);
    mac.verify_slice(proof).is_ok()
}

fn pct(s: &str) -> String {
    urlencoding::encode(s).into_owned()
}

/// The text inside the pairing QR code (LINK-v1 §3).
pub fn pairing_url(
    pc_id: &str,
    pc_name: &str,
    hosts: &[String],
    port: u16,
    fingerprint_hex: &str,
    token: &str,
) -> String {
    format!(
        "pinchdrop://pair?v={PROTOCOL_VERSION}&id={}&n={}&h={}&p={port}&fp={fingerprint_hex}&t={}",
        pct(pc_id),
        pct(pc_name),
        pct(&hosts.join(",")),
        pct(token)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sas_test_vector_is_stable_and_six_digits() {
        let fp = "00".repeat(32);
        let code = sas_code(&fp, &[1u8; 32], &[2u8; 32]).unwrap();
        assert_eq!(code.len(), 6);
        assert!(code.chars().all(|c| c.is_ascii_digit()));
        // Same inputs → same code; swapping nonces → (almost certainly) a different one.
        assert_eq!(code, sas_code(&fp, &[1u8; 32], &[2u8; 32]).unwrap());
        assert_ne!(code, sas_code(&fp, &[2u8; 32], &[1u8; 32]).unwrap());
        // Pin the vector so the Android implementation can be checked against it.
        assert_eq!(code, SAS_VECTOR);
    }

    /// Expected code for the LINK-v1 §5 test vector. Mirrored in the Android ProtoTest.
    const SAS_VECTOR: &str = "749713";

    #[test]
    fn sas_rejects_bad_fingerprint() {
        assert!(sas_code("abcd", &[0; 32], &[0; 32]).is_none());
        assert!(sas_code("zz", &[0; 32], &[0; 32]).is_none());
    }

    #[test]
    fn proof_round_trip() {
        let secret = [7u8; 32];
        let nonce = [9u8; 32];
        let p = auth_proof(&secret, &nonce);
        assert!(verify_proof(&secret, &nonce, &p));
        assert!(!verify_proof(&[8u8; 32], &nonce, &p));
        assert!(!verify_proof(&secret, &[0u8; 32], &p));
    }

    #[test]
    fn envelope_round_trip_and_version_check() {
        let text = message("status", serde_json::json!({"battery": 80}));
        let env = parse(&text).unwrap();
        assert_eq!(env.kind, "status");
        assert_eq!(env.payload["battery"], 80);
        assert!(parse(r#"{"v":2,"id":"x","type":"status","ts":0,"payload":{}}"#).is_none());
        assert!(parse("not json").is_none());
    }

    #[test]
    fn pairing_url_is_encoded() {
        let url = pairing_url(
            "abc",
            "My Laptop",
            &["192.168.1.5".into(), "10.0.0.2".into()],
            47821,
            "ff",
            "tok",
        );
        assert_eq!(url, "pinchdrop://pair?v=1&id=abc&n=My%20Laptop&h=192.168.1.5%2C10.0.0.2&p=47821&fp=ff&t=tok");
    }

    #[test]
    fn fingerprint_is_hex_sha256() {
        assert_eq!(
            fingerprint(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
