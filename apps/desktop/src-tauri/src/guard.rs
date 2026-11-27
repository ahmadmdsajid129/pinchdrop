//! v2 Pro · makes the trial and keys harder to cheat on this PC:
//!
//! - **Machine fingerprint**: a hash of Windows' MachineGuid. Keys the licence service issues
//!   carry it, so a key copied from one PC's `license.json` doesn't unlock another PC.
//! - **Trial anchor**: when the trial started and the latest time the app has seen, stored in
//!   two places (the licence file and the registry, which survives uninstalling), each with a
//!   MAC bound to this machine. Deleting one keeps the other; editing either is detected.
//! - **Clock**: the app never believes a time earlier than the latest it has seen, so turning
//!   the PC clock back doesn't bring the trial or an expired subscription back.
//!
//! None of this can stop someone who rewrites the program itself; it stops the easy tricks.

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::sync::OnceLock;

/// The anchor's place in the registry (per user, no admin needed).
#[cfg(windows)]
const REG_KEY: &str = r"Software\PinchDrop";
#[cfg(windows)]
const REG_VALUE: &str = "Anchor";

fn machine_id() -> &'static str {
    static ID: OnceLock<String> = OnceLock::new();
    ID.get_or_init(|| {
        read_machine_guid().unwrap_or_else(|| {
            // Without the GUID (very unusual): the PC's and the user's names.
            format!(
                "{}|{}",
                std::env::var("COMPUTERNAME").unwrap_or_default(),
                std::env::var("USERNAME").unwrap_or_default()
            )
        })
    })
}

/// This PC's fingerprint as the licence service puts it in keys (32 hex characters).
pub fn machine_hash() -> String {
    let mut h = Sha256::new();
    h.update(b"pinchdrop-machine-v1|");
    h.update(machine_id().as_bytes());
    hex::encode(&h.finalize()[..16])
}

fn mac_of(text: &str) -> String {
    let key = Sha256::digest(format!("pinchdrop-anchor-v1|{}", machine_id()).as_bytes());
    let mut m = <Hmac<Sha256>>::new_from_slice(&key).expect("any key length works");
    m.update(text.as_bytes());
    hex::encode(&m.finalize().into_bytes()[..12])
}

/// When the trial started, and the latest time seen.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Anchor {
    pub trial_started: u64,
    pub last_seen: u64,
}

pub fn seal(a: Anchor) -> String {
    let body = format!("{}.{}", a.trial_started, a.last_seen);
    format!("{body}.{}", mac_of(&body))
}

/// `Ok(None)`: nothing stored. `Err(())`: something is stored but was changed by hand.
#[allow(clippy::result_unit_err)]
pub fn unseal(s: &str) -> Result<Option<Anchor>, ()> {
    let s = s.trim();
    if s.is_empty() {
        return Ok(None);
    }
    let (body, mac) = s.rsplit_once('.').ok_or(())?;
    if mac_of(body) != mac {
        return Err(());
    }
    let (t, seen) = body.split_once('.').ok_or(())?;
    Ok(Some(Anchor {
        trial_started: t.parse().map_err(|_| ())?,
        last_seen: seen.parse().map_err(|_| ())?,
    }))
}

/// Combines what was found: the earliest trial start and the latest time seen. A changed record
/// ends the trial; a start date in the future (a clock or file trick) does too.
pub fn combine(found: &[Result<Option<Anchor>, ()>], legacy_trial: u64, now: u64) -> Anchor {
    const DAY: u64 = 86_400;
    let tampered = found.iter().any(|f| f.is_err());
    let good: Vec<Anchor> = found.iter().filter_map(|f| f.ok().flatten()).collect();
    let mut trial = good.iter().map(|a| a.trial_started).min().unwrap_or(0);
    let seen = good.iter().map(|a| a.last_seen).max().unwrap_or(0).max(now);
    if trial == 0 {
        // First run of this version: an older install's start date, or now.
        trial = if legacy_trial > 0 { legacy_trial } else { now };
    }
    if tampered || trial > seen + DAY {
        trial = 1; // long ago: the trial is over
    }
    Anchor {
        trial_started: trial,
        last_seen: seen,
    }
}

// ---------------------------------------------------------------- Windows registry

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn read_machine_guid() -> Option<String> {
    read_reg_sz(
        windows::Win32::System::Registry::HKEY_LOCAL_MACHINE,
        r"SOFTWARE\Microsoft\Cryptography",
        "MachineGuid",
        true,
    )
}

#[cfg(not(windows))]
fn read_machine_guid() -> Option<String> {
    std::fs::read_to_string("/etc/machine-id")
        .ok()
        .map(|s| s.trim().to_string())
}

#[cfg(windows)]
fn read_reg_sz(
    root: windows::Win32::System::Registry::HKEY,
    key: &str,
    value: &str,
    wow64: bool,
) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegGetValueW, RRF_RT_REG_SZ, RRF_SUBKEY_WOW6464KEY};
    let k = wide(key);
    let v = wide(value);
    let flags = if wow64 {
        RRF_RT_REG_SZ | RRF_SUBKEY_WOW6464KEY
    } else {
        RRF_RT_REG_SZ
    };
    let mut buf = vec![0u16; 256];
    let mut len = (buf.len() * 2) as u32;
    let r = unsafe {
        RegGetValueW(
            root,
            PCWSTR(k.as_ptr()),
            PCWSTR(v.as_ptr()),
            flags,
            None,
            Some(buf.as_mut_ptr().cast()),
            Some(&mut len),
        )
    };
    if r.is_err() {
        return None;
    }
    let n = (len as usize / 2).saturating_sub(1).min(buf.len());
    Some(String::from_utf16_lossy(&buf[..n]).trim().to_string())
}

/// The anchor kept in the registry ("" if there's none).
#[cfg(windows)]
pub fn read_registry() -> String {
    read_reg_sz(
        windows::Win32::System::Registry::HKEY_CURRENT_USER,
        REG_KEY,
        REG_VALUE,
        false,
    )
    .unwrap_or_default()
}

#[cfg(windows)]
pub fn write_registry(sealed: &str) {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ};
    let k = wide(REG_KEY);
    let v = wide(REG_VALUE);
    let data = wide(sealed);
    unsafe {
        let _ = RegSetKeyValueW(
            HKEY_CURRENT_USER,
            PCWSTR(k.as_ptr()),
            PCWSTR(v.as_ptr()),
            REG_SZ.0,
            Some(data.as_ptr().cast()),
            (data.len() * 2) as u32,
        );
    }
}

#[cfg(not(windows))]
pub fn read_registry() -> String {
    String::new()
}

#[cfg(not(windows))]
pub fn write_registry(_sealed: &str) {}

/// Release builds: a debugger can't be attached to the app's windows (that would let someone
/// switch Pro on in the page). WebView2 reads extra browser flags from an environment variable;
/// the debugging ones are removed before any window opens. QA builds (`--features qa`) keep them.
pub fn block_webview_debugging() {
    if cfg!(feature = "qa") || cfg!(debug_assertions) {
        return;
    }
    const VAR: &str = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";
    if let Ok(v) = std::env::var(VAR) {
        let kept: Vec<&str> = v
            .split_whitespace()
            .filter(|a| {
                let a = a.to_ascii_lowercase();
                !(a.contains("remote-debugging")
                    || a.contains("devtools")
                    || a.contains("remote-allow-origins"))
            })
            .collect();
        if kept.is_empty() {
            std::env::remove_var(VAR);
        } else {
            std::env::set_var(VAR, kept.join(" "));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_900_000_000;
    const DAY: u64 = 86_400;

    #[test]
    fn sealed_anchor_round_trips() {
        let a = Anchor {
            trial_started: NOW - DAY,
            last_seen: NOW,
        };
        assert_eq!(unseal(&seal(a)), Ok(Some(a)));
        assert_eq!(unseal(""), Ok(None));
    }

    #[test]
    fn edited_anchor_is_caught() {
        let s = seal(Anchor {
            trial_started: NOW - 6 * DAY,
            last_seen: NOW,
        });
        // move the trial start a week later by hand
        let edited = s.replacen(&(NOW - 6 * DAY).to_string(), &(NOW + DAY).to_string(), 1);
        assert_eq!(unseal(&edited), Err(()));
        assert_eq!(unseal("123.456.deadbeef"), Err(()));
        let a = combine(&[unseal(&edited), unseal(&s)], 0, NOW);
        assert_eq!(a.trial_started, 1, "a changed record ends the trial");
    }

    #[test]
    fn deleting_one_copy_keeps_the_other() {
        let s = seal(Anchor {
            trial_started: NOW - 6 * DAY,
            last_seen: NOW - DAY,
        });
        let a = combine(&[Ok(None), unseal(&s)], 0, NOW);
        assert_eq!(a.trial_started, NOW - 6 * DAY);
        assert_eq!(a.last_seen, NOW);
    }

    #[test]
    fn first_run_starts_now_or_keeps_an_old_start() {
        assert_eq!(combine(&[Ok(None), Ok(None)], 0, NOW).trial_started, NOW);
        assert_eq!(
            combine(&[Ok(None), Ok(None)], NOW - 3 * DAY, NOW).trial_started,
            NOW - 3 * DAY
        );
        // an old file claiming a start in the future: over
        assert_eq!(combine(&[Ok(None)], NOW + 30 * DAY, NOW).trial_started, 1);
    }

    #[test]
    fn turning_the_clock_back_doesnt_help() {
        let s = seal(Anchor {
            trial_started: NOW - 10 * DAY,
            last_seen: NOW,
        });
        // the PC clock now says 9 days earlier
        let a = combine(&[unseal(&s)], 0, NOW - 9 * DAY);
        assert_eq!(a.last_seen, NOW, "the app keeps the latest time it saw");
    }

    #[test]
    fn fingerprint_is_stable_and_short() {
        let a = machine_hash();
        assert_eq!(a.len(), 32);
        assert_eq!(a, machine_hash());
    }
}
