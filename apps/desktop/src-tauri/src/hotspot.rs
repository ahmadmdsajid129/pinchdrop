//! v2 · Huddle's hotspot fallback, for Wi-Fi that won't let laptops see each other (common at
//! venues and offices).
//!
//! * **Host:** turns on Windows' Mobile Hotspot, named after the huddle's join code
//!   (`PinchDrop-KX7Q`, password from the full code). The previous hotspot name and password are
//!   put back when the huddle ends.
//! * **Teammate:** types the join code; PinchDrop adds a Wi-Fi profile for that hotspot and
//!   connects to it. When they leave, it reconnects to the Wi-Fi they were on and removes the
//!   profile.

#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

/// The hotspot's network name for a join code.
pub fn ssid_for(code: &str) -> String {
    format!("PinchDrop-{}", &code[..4.min(code.len())])
}

/// The hotspot's password for a join code (WPA2 needs 8+ characters).
pub fn pass_for(code: &str) -> String {
    format!("pinchdrop-{code}")
}

#[cfg(windows)]
fn netsh(args: &[&str]) -> Option<String> {
    let out = Command::new("netsh")
        .args(args)
        .creation_flags(0x0800_0000)
        .output()
        .ok()?;
    Some(String::from_utf8_lossy(&out.stdout).to_string())
}

#[cfg(not(windows))]
fn netsh(_args: &[&str]) -> Option<String> {
    None
}

/// The Wi-Fi this laptop is connected to right now, if any.
pub fn current_wifi() -> Option<String> {
    let out = netsh(&["wlan", "show", "interfaces"])?;
    let mut connected = false;
    let mut ssid = None;
    for line in out.lines() {
        let l = line.trim();
        let Some((k, v)) = l.split_once(':') else {
            continue;
        };
        let (k, v) = (k.trim(), v.trim());
        if k.eq_ignore_ascii_case("State") {
            connected = v.eq_ignore_ascii_case("connected");
        }
        if k.eq_ignore_ascii_case("SSID") && !v.is_empty() {
            ssid = Some(v.to_string());
        }
    }
    if connected {
        ssid
    } else {
        None
    }
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Connects this laptop to a hotspot (WPA2-PSK). Returns the Wi-Fi it was on before.
pub fn connect(ssid: &str, pass: &str, tmp: &Path) -> Result<Option<String>, String> {
    let before = current_wifi();
    if before.as_deref() == Some(ssid) {
        return Ok(None);
    }
    let x = xml_escape(ssid);
    let profile = format!(
        r#"<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>{x}</name>
  <SSIDConfig><SSID><name>{x}</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>manual</connectionMode>
  <MSM><security>
    <authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>
    <sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>{}</keyMaterial></sharedKey>
  </security></MSM>
</WLANProfile>"#,
        xml_escape(pass)
    );
    let file = tmp.join("pinchdrop-huddle-wifi.xml");
    std::fs::write(&file, profile).map_err(|e| e.to_string())?;
    let file_s = file.to_string_lossy().to_string();
    let added = netsh(&[
        "wlan",
        "add",
        "profile",
        &format!("filename={file_s}"),
        "user=current",
    ]);
    let _ = std::fs::remove_file(&file); // the password shouldn't sit on disk
    if added.is_none() {
        return Err("This laptop has no Wi-Fi.".into());
    }
    netsh(&[
        "wlan",
        "connect",
        &format!("name={ssid}"),
        &format!("ssid={ssid}"),
    ]);
    let deadline = Instant::now() + Duration::from_secs(25);
    while Instant::now() < deadline {
        if current_wifi().as_deref() == Some(ssid) {
            std::thread::sleep(Duration::from_secs(3)); // an address from the hotspot
            return Ok(before);
        }
        std::thread::sleep(Duration::from_millis(700));
    }
    let _ = netsh(&["wlan", "delete", "profile", &format!("name={ssid}")]);
    if let Some(b) = &before {
        netsh(&["wlan", "connect", &format!("name={b}")]);
    }
    Err(format!("Couldn't connect to \"{ssid}\". Check the code, and that the host's hotspot is on and nearby."))
}

/// Back to the Wi-Fi the laptop was on; forget the hotspot.
pub fn disconnect(ssid: &str, before: Option<&str>) {
    let _ = netsh(&["wlan", "delete", "profile", &format!("name={ssid}")]);
    if let Some(b) = before {
        netsh(&["wlan", "connect", &format!("name={b}")]);
    }
}

/// What the hotspot was set to before PinchDrop changed it (put back afterwards).
pub struct Saved {
    ssid: String,
    pass: String,
}

#[cfg(windows)]
mod win {
    use super::Saved;
    use windows::core::HSTRING;
    use windows::Networking::Connectivity::NetworkInformation;
    use windows::Networking::NetworkOperators::{
        NetworkOperatorTetheringManager, TetheringOperationStatus,
    };

    fn manager() -> Result<NetworkOperatorTetheringManager, String> {
        let profile = NetworkInformation::GetInternetConnectionProfile().map_err(|_| {
            "This laptop needs to be online (Wi-Fi or cable) to share a hotspot.".to_string()
        })?;
        NetworkOperatorTetheringManager::CreateFromConnectionProfile(&profile)
            .map_err(|_| "Windows can't share a hotspot from this connection.".to_string())
    }

    pub fn start(ssid: &str, pass: &str) -> Result<Saved, String> {
        let mgr = manager()?;
        let cfg = mgr
            .GetCurrentAccessPointConfiguration()
            .map_err(|e| e.message().to_string())?;
        let saved = Saved {
            ssid: cfg.Ssid().map(|s| s.to_string()).unwrap_or_default(),
            pass: cfg.Passphrase().map(|s| s.to_string()).unwrap_or_default(),
        };
        cfg.SetSsid(&HSTRING::from(ssid))
            .map_err(|e| e.message().to_string())?;
        cfg.SetPassphrase(&HSTRING::from(pass))
            .map_err(|e| e.message().to_string())?;
        mgr.ConfigureAccessPointAsync(&cfg)
            .and_then(|op| op.join())
            .map_err(|e| format!("Couldn't set up the hotspot: {}", e.message()))?;
        let result = mgr
            .StartTetheringAsync()
            .and_then(|op| op.join())
            .map_err(|e| format!("Couldn't start the hotspot: {}", e.message()))?;
        let status = result.Status().map_err(|e| e.message().to_string())?;
        if status != TetheringOperationStatus::Success {
            let more = result
                .AdditionalErrorMessage()
                .map(|m| m.to_string())
                .unwrap_or_default();
            return Err(match status {
                TetheringOperationStatus::WiFiDeviceOff => "Turn Wi-Fi on first.".to_string(),
                TetheringOperationStatus::OperationInProgress => {
                    "Windows is already changing the hotspot. Try again in a moment.".to_string()
                }
                _ => format!(
                    "Windows couldn't start the hotspot{}.",
                    if more.is_empty() {
                        String::new()
                    } else {
                        format!(": {more}")
                    }
                ),
            });
        }
        Ok(saved)
    }

    pub fn stop(saved: &Saved) {
        let Ok(mgr) = manager() else { return };
        let _ = mgr.StopTetheringAsync().and_then(|op| op.join());
        if let Ok(cfg) = mgr.GetCurrentAccessPointConfiguration() {
            if !saved.ssid.is_empty() {
                let _ = cfg.SetSsid(&HSTRING::from(saved.ssid.as_str()));
                let _ = cfg.SetPassphrase(&HSTRING::from(saved.pass.as_str()));
                let _ = mgr.ConfigureAccessPointAsync(&cfg).and_then(|op| op.join());
            }
        }
    }
}

/// Turns on the Mobile Hotspot with this name and password.
pub fn start(ssid: &str, pass: &str) -> Result<Saved, String> {
    #[cfg(windows)]
    {
        win::start(ssid, pass)
    }
    #[cfg(not(windows))]
    {
        let _ = (ssid, pass);
        Err("Hotspots are only supported on Windows.".into())
    }
}

/// Turns the hotspot off and puts its old name and password back.
pub fn stop(saved: &Saved) {
    #[cfg(windows)]
    win::stop(saved);
    #[cfg(not(windows))]
    let _ = saved;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_from_the_code() {
        assert_eq!(ssid_for("KX7Q49MZ"), "PinchDrop-KX7Q");
        assert_eq!(pass_for("KX7Q49MZ"), "pinchdrop-KX7Q49MZ");
        assert!(pass_for("KX7Q49MZ").len() >= 8);
    }

    #[test]
    fn xml_is_escaped() {
        assert_eq!(xml_escape("a&b<\"c\">"), "a&amp;b&lt;&quot;c&quot;&gt;");
    }
}
