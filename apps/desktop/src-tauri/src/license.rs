//! PinchDrop Pro: licence keys, the free trial, and "is this feature allowed?".
//!
//! No account and no server. A licence key is a small signed note:
//!
//! ```text
//! PD1-<base64url(JSON payload)>.<base64url(Ed25519 signature of those JSON bytes)>
//! payload: {"v":1,"id":"…","name":"…","plan":"lifetime"|"year"|"month","issued":unix,"expires":unix|null}
//! ```
//!
//! Keys bought on the PinchDrop website come from Dodo Payments (emailed to the buyer). Pasting
//! one here asks the PinchDrop licence service (a small Cloudflare Worker, `cloud/licence-worker`)
//! to check it with Dodo and send back a signed PD1 key, which then works offline.
//! Yearly / monthly keys are refreshed in the background while the subscription runs.
//!
//! The app holds only the public key, so it can check a key but never make one. Keys are made
//! with `tools/issue-license.mjs` (`pnpm license`) and the private key, which lives outside the repository.
//! The key and the trial start date are kept in `license.json` in the settings folder.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde::{Deserialize, Serialize};

/// Ed25519 public key that checks licence keys (the matching private key is not in the repo).
const PUBLIC_KEY_HEX: &str = "4696cacafcf53605bcd5ebe84fa07d9860ce1f4d059d6fd832f57a62c87873ec";

/// The licence service (cloud/licence-worker). Set when the Worker is deployed (docs/launch.md).
pub const REDEEM_URL: &str = "https://pinchdrop-licence.ahmadmdsajid129.workers.dev/redeem";
/// Dodo Payments' public licence API: frees this PC's seat when the key is removed.
const DODO_DEACTIVATE: &str = "https://live.dodopayments.com/licenses/deactivate";

/// New installs (and existing ones, the first time they run v2) get Pro free for this long.
pub const TRIAL_DAYS: u64 = 7;
/// Free sends up to this size; bigger needs Pro.
pub const FREE_MAX_SEND_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// A timed key still works this long after it runs out (clock drift, renewal on the way).
const GRACE_SECS: u64 = 3 * 86_400;
const DAY: u64 = 86_400;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct LicenseFile {
    key: Option<String>,
    trial_started: u64,
    /// A key bought on the website (Dodo Payments) this PC activated, and its activation (to refresh / free the seat).
    ls_key: Option<String>,
    ls_instance: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Payload {
    pub v: u32,
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub plan: String,
    pub issued: u64,
    #[serde(default)]
    pub expires: Option<u64>,
}

/// What the app shows in Settings → PinchDrop Pro and uses to unlock features.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProStatus {
    /// "pro" (a valid key), "trial" or "free".
    pub plan: String,
    pub active: bool,
    pub trial_days_left: u64,
    /// "lifetime" | "year" | "month" with a key.
    pub kind: Option<String>,
    pub licensee: Option<String>,
    pub expires: Option<u64>,
    /// A saved key that no longer works (expired), shown so the user knows why.
    pub problem: Option<String>,
}

struct State {
    path: PathBuf,
    file: LicenseFile,
}

static STATE: Mutex<Option<State>> = Mutex::new(None);

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Loads `license.json`; on the very first run it starts the trial.
pub fn init(config_dir: &Path) {
    let path = config_dir.join("license.json");
    let mut file: LicenseFile = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    if file.trial_started == 0 {
        file.trial_started = now();
        save(&path, &file);
    }
    if let Ok(mut g) = STATE.lock() {
        *g = Some(State { path, file });
    }
}

fn save(path: &Path, file: &LicenseFile) {
    if let Ok(s) = serde_json::to_string_pretty(file) {
        let _ = std::fs::write(path, s);
    }
}

/// Checks a key's signature and reads it. Doesn't look at the date.
pub fn verify(key: &str) -> Result<Payload, String> {
    verify_with(key, PUBLIC_KEY_HEX)
}

fn verify_with(key: &str, public_hex: &str) -> Result<Payload, String> {
    let bad = || {
        "That isn't a valid PinchDrop licence key. Check that it was copied in full.".to_string()
    };
    let key: String = key.chars().filter(|c| !c.is_whitespace()).collect();
    let body = key.strip_prefix("PD1-").ok_or_else(bad)?;
    let (p64, s64) = body.split_once('.').ok_or_else(bad)?;
    let b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let payload = b64.decode(p64).map_err(|_| bad())?;
    let sig = b64.decode(s64).map_err(|_| bad())?;
    let public = hex::decode(public_hex).map_err(|_| bad())?;
    ring::signature::UnparsedPublicKey::new(&ring::signature::ED25519, &public)
        .verify(&payload, &sig)
        .map_err(|_| bad())?;
    let p: Payload = serde_json::from_slice(&payload).map_err(|_| bad())?;
    if p.v != 1 {
        return Err("This key is for a newer PinchDrop. Please update the app.".into());
    }
    Ok(p)
}

fn expired(p: &Payload, at: u64) -> bool {
    p.expires.is_some_and(|e| at > e + GRACE_SECS)
}

fn status_of(file: &LicenseFile, at: u64) -> ProStatus {
    let trial_end = file.trial_started + TRIAL_DAYS * DAY;
    let trial_days_left = if at < trial_end {
        (trial_end - at).div_ceil(DAY)
    } else {
        0
    };
    let mut problem = None;
    if let Some(key) = &file.key {
        match verify(key) {
            Ok(p) if !expired(&p, at) => {
                return ProStatus {
                    plan: "pro".into(),
                    active: true,
                    trial_days_left,
                    kind: Some(p.plan.clone()),
                    licensee: (!p.name.is_empty()).then(|| p.name.clone()),
                    expires: p.expires,
                    problem: None,
                };
            }
            Ok(_) => problem = Some("Your Pro licence has run out. Renew it to keep Pro.".into()),
            Err(e) => problem = Some(e),
        }
    }
    let trial = trial_days_left > 0;
    ProStatus {
        plan: if trial { "trial" } else { "free" }.into(),
        active: trial,
        trial_days_left,
        kind: None,
        licensee: None,
        expires: None,
        problem,
    }
}

pub fn status() -> ProStatus {
    let file = STATE
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|s| s.file.clone()))
        .unwrap_or_default();
    status_of(&file, now())
}

/// Pro (a key or the trial) is on.
pub fn is_pro() -> bool {
    status().active
}

/// The error a Pro-only command returns when Pro is off. The app turns it into an upgrade
/// prompt naming the feature.
pub fn need(feature: &str) -> Result<(), String> {
    if is_pro() {
        Ok(())
    } else {
        Err(format!("PRO:{feature}"))
    }
}

/// A key typed by the user: a PD1 key works straight away; anything else is treated as a key
/// bought on the website and checked online.
pub async fn activate_any(key: &str) -> Result<ProStatus, String> {
    let k: String = key.split_whitespace().collect();
    if k.starts_with("PD1-") {
        return activate(&k);
    }
    if k.len() < 16 {
        return Err("That isn't a PinchDrop licence key. Check that it was copied in full.".into());
    }
    let (pd1, instance) = redeem(&k, None, None).await?;
    let st = activate(&pd1)?;
    if let Ok(mut g) = STATE.lock() {
        if let Some(s) = g.as_mut() {
            s.file.ls_key = Some(k);
            s.file.ls_instance = instance;
            save(&s.path, &s.file);
        }
    }
    Ok(st)
}

/// Asks the licence service for a signed key. Returns (PD1 key, activation id).
async fn redeem(
    ls_key: &str,
    instance: Option<&str>,
    current: Option<&Payload>,
) -> Result<(String, Option<String>), String> {
    let machine = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".into());
    // Renewing: the plan and name to keep (the service decides the expiry).
    let body = serde_json::json!({
        "licenseKey": ls_key,
        "instanceId": instance,
        "instanceName": format!("PinchDrop on {machine}"),
        "plan": current.map(|p| p.plan.clone()),
        "name": current.map(|p| p.name.clone()),
    });
    let resp = reqwest::Client::new()
        .post(REDEEM_URL)
        .timeout(std::time::Duration::from_secs(20))
        .json(&body)
        .send()
        .await
        .map_err(|_| {
            "Couldn't reach the PinchDrop licence service. Check your internet and try again."
                .to_string()
        })?;
    let v: serde_json::Value = resp.json().await.map_err(|_| {
        "The licence service sent something unexpected. Try again in a minute.".to_string()
    })?;
    if let Some(e) = v["error"].as_str() {
        return Err(e.to_string());
    }
    let key = v["key"]
        .as_str()
        .ok_or("The licence service didn't send a key.")?
        .to_string();
    Ok((key, v["instanceId"].as_str().map(String::from)))
}

/// A yearly / monthly key: get a fresh PD1 key when it's within 10 days of running out (the
/// subscription renews on Dodo's side). Quietly does nothing offline.
pub async fn refresh() {
    let (ls, inst, current) = {
        let Ok(g) = STATE.lock() else { return };
        let Some(s) = g.as_ref() else { return };
        let p = s.file.key.as_deref().and_then(|k| verify(k).ok());
        (s.file.ls_key.clone(), s.file.ls_instance.clone(), p)
    };
    let (Some(ls), Some(cur)) = (ls, current) else {
        return;
    };
    let Some(exp) = cur.expires else { return }; // lifetime: nothing to renew
    if exp > now() + 10 * DAY {
        return;
    }
    if let Ok((pd1, _)) = redeem(&ls, inst.as_deref(), Some(&cur)).await {
        let _ = activate(&pd1);
    }
}

/// Saves a key after checking it.
pub fn activate(key: &str) -> Result<ProStatus, String> {
    let p = verify(key)?;
    if expired(&p, now()) {
        return Err("This licence key has run out. Renew it to keep Pro.".into());
    }
    let mut g = STATE.lock().map_err(|_| "Busy, try again")?;
    let st = g.as_mut().ok_or("Not ready yet, try again")?;
    st.file.key = Some(key.split_whitespace().collect());
    save(&st.path, &st.file);
    Ok(status_of(&st.file, now()))
}

/// Removes the key from this PC (e.g. to move it to another one). A website key's seat is freed
/// so it can be used on the new PC.
pub async fn remove() -> ProStatus {
    let seat = STATE.lock().ok().and_then(|mut g| {
        g.as_mut().map(|st| {
            st.file.key = None;
            let seat = (st.file.ls_key.take(), st.file.ls_instance.take());
            save(&st.path, &st.file);
            seat
        })
    });
    if let Some((Some(k), Some(i))) = seat {
        let _ = reqwest::Client::new()
            .post(DODO_DEACTIVATE)
            .timeout(std::time::Duration::from_secs(15))
            .json(&serde_json::json!({ "license_key": k, "license_key_instance_id": i }))
            .send()
            .await;
    }
    status()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::signature::KeyPair;

    fn make(payload: &str) -> (String, String) {
        let rng = ring::rand::SystemRandom::new();
        let doc = ring::signature::Ed25519KeyPair::generate_pkcs8(&rng).unwrap();
        let kp = ring::signature::Ed25519KeyPair::from_pkcs8(doc.as_ref()).unwrap();
        let b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let sig = kp.sign(payload.as_bytes());
        (
            format!("PD1-{}.{}", b64.encode(payload), b64.encode(sig.as_ref())),
            hex::encode(kp.public_key().as_ref()),
        )
    }

    const LIFETIME: &str =
        r#"{"v":1,"id":"k1","name":"Asha","plan":"lifetime","issued":1700000000,"expires":null}"#;

    #[test]
    fn a_signed_key_is_accepted() {
        let (key, public) = make(LIFETIME);
        let p = verify_with(&key, &public).unwrap();
        assert_eq!(p.plan, "lifetime");
        assert_eq!(p.name, "Asha");
        // copied with spaces / line breaks still works
        let spaced = format!("  {}\n{} ", &key[..20], &key[20..]);
        assert!(verify_with(&spaced, &public).is_ok());
    }

    #[test]
    fn a_changed_key_is_refused() {
        let (key, public) = make(LIFETIME);
        let b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let forged = LIFETIME.replace("Asha", "Mallory");
        let sig = key.split_once('.').unwrap().1;
        let tampered = format!("PD1-{}.{}", b64.encode(forged), sig);
        assert!(verify_with(&tampered, &public).is_err());
        assert!(verify_with("hello", &public).is_err());
        // signed by someone else's key
        let (other, _) = make(LIFETIME);
        assert!(verify_with(&other, &public).is_err());
    }

    #[test]
    fn real_public_key_refuses_test_keys() {
        let (key, _) = make(LIFETIME);
        assert!(verify(&key).is_err());
    }

    /// Made with the real private key (tools/issue-license.mjs format), expired in 1970 so it
    /// unlocks nothing: proves the app and the issuing tool agree.
    const REAL_EXPIRED_KEY: &str = "PD1-eyJ2IjoxLCJpZCI6InRlc3QwMDAwIiwibmFtZSI6IkV4cGlyZWQgdGVzdCBrZXkiLCJwbGFuIjoibW9udGgiLCJpc3N1ZWQiOjEwMDAsImV4cGlyZXMiOjIwMDB9.mewtQw1QS0gLMUwtD4Q6e6xBiednB0RdHQVEVPLuRrvKRT_X9Y0S5qFnkjNxgfqbWZHBG4o9t45r3Zmmw4g2Aw";

    #[test]
    fn a_key_from_the_issuing_tool_is_recognised() {
        let p = verify(REAL_EXPIRED_KEY).unwrap();
        assert_eq!(p.plan, "month");
        assert!(expired(&p, now()));
        let f = LicenseFile {
            key: Some(REAL_EXPIRED_KEY.into()),
            trial_started: 0,
            ..Default::default()
        };
        let s = status_of(&f, now());
        assert!(!s.active);
        assert!(s.problem.is_some());
    }

    #[test]
    fn trial_counts_down_then_ends() {
        let day0 = 1_800_000_000;
        let f = LicenseFile {
            key: None,
            trial_started: day0,
            ..Default::default()
        };
        let s = status_of(&f, day0 + 60);
        assert_eq!(
            (s.plan.as_str(), s.active, s.trial_days_left),
            ("trial", true, 7)
        );
        let s = status_of(&f, day0 + 6 * DAY + 10);
        assert_eq!(s.trial_days_left, 1);
        let s = status_of(&f, day0 + 7 * DAY + 1);
        assert_eq!((s.plan.as_str(), s.active), ("free", false));
    }

    #[test]
    fn expiry_has_a_short_grace() {
        let p = Payload {
            v: 1,
            id: "x".into(),
            name: String::new(),
            plan: "year".into(),
            issued: 0,
            expires: Some(1000),
        };
        assert!(!expired(&p, 1000 + GRACE_SECS));
        assert!(expired(&p, 1001 + GRACE_SECS));
        let life = Payload { expires: None, ..p };
        assert!(!expired(&life, u64::MAX));
    }
}
