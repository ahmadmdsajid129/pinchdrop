//! v2 · Where each phone is, for the PC's map. The phone sends its location about once a minute
//! while connected; the PC keeps the **last place it saw** for every phone (places.json in the
//! app's own folder), so a phone that went missing or was switched off still shows where it
//! was last seen. Nothing leaves this PC.

use super::*;
use std::collections::HashMap;
use std::sync::LazyLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub device_id: String,
    pub device_name: String,
    pub lat: f64,
    pub lon: f64,
    /// Metres.
    pub accuracy: f64,
    /// When the phone measured it (ms since 1970).
    pub time: u64,
}

/// A place on the map, and whether that phone is connected right now.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceView {
    #[serde(flatten)]
    pub place: Place,
    pub connected: bool,
}

static PLACES: LazyLock<Mutex<HashMap<String, Place>>> = LazyLock::new(Default::default);
static LAST_SAVE: LazyLock<Mutex<Option<Instant>>> = LazyLock::new(Default::default);

fn places_path(app: &AppHandle) -> PathBuf {
    app.try_state::<crate::AppState>()
        .map(|s| s.config_dir.join("places.json"))
        .unwrap_or_else(|| std::env::temp_dir().join("pinchdrop-places.json"))
}

/// A sane coordinate (not 0,0 "no fix", within the globe).
pub fn valid(lat: f64, lon: f64) -> bool {
    lat.is_finite()
        && lon.is_finite()
        && lat.abs() <= 90.0
        && lon.abs() <= 180.0
        && !(lat == 0.0 && lon == 0.0)
}

impl Link {
    pub(super) fn places_load(&self) {
        let list: Vec<Place> = std::fs::read_to_string(places_path(&self.app))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        if let Ok(mut p) = PLACES.lock() {
            *p = list.into_iter().map(|x| (x.device_id.clone(), x)).collect();
        }
    }

    fn places_save(&self, force: bool) {
        if let Ok(mut last) = LAST_SAVE.lock() {
            if !force && last.is_some_and(|t| t.elapsed() < Duration::from_secs(60)) {
                return;
            }
            *last = Some(Instant::now());
        }
        let list: Vec<Place> = PLACES
            .lock()
            .map(|p| p.values().cloned().collect())
            .unwrap_or_default();
        if let Ok(json) = serde_json::to_string_pretty(&list) {
            let _ = std::fs::write(places_path(&self.app), json);
        }
    }

    pub(super) fn on_location(&self, dev: &str, p: &Value) {
        let lat = p.get("lat").and_then(Value::as_f64).unwrap_or(f64::NAN);
        let lon = p.get("lon").and_then(Value::as_f64).unwrap_or(f64::NAN);
        if !valid(lat, lon) {
            return;
        }
        let place = Place {
            device_id: dev.to_string(),
            device_name: self.device_name(dev),
            lat,
            lon,
            accuracy: p
                .get("accuracy")
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
                .clamp(0.0, 100_000.0),
            time: p.get("time").and_then(Value::as_u64).unwrap_or_else(now_ms),
        };
        if let Ok(mut m) = PLACES.lock() {
            m.insert(dev.to_string(), place);
        }
        self.places_save(false);
        let _ = self.app.emit("phone-places", self.places());
    }

    /// Every phone's last known place (connected ones are live).
    pub fn places(&self) -> Vec<PlaceView> {
        let live: std::collections::HashSet<String> = self
            .sessions
            .lock()
            .map(|s| s.keys().cloned().collect())
            .unwrap_or_default();
        let mut v: Vec<PlaceView> = PLACES
            .lock()
            .map(|m| {
                m.values()
                    .cloned()
                    .map(|place| PlaceView {
                        connected: live.contains(&place.device_id),
                        place,
                    })
                    .collect()
            })
            .unwrap_or_default();
        v.sort_by_key(|x| std::cmp::Reverse(x.place.time));
        v
    }

    /// A phone disconnected: write its last place now (it may not come back soon).
    pub(super) fn places_flush(&self) {
        self.places_save(true);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn rejects_bad_coordinates() {
        use super::valid;
        assert!(valid(28.6139, 77.2090));
        assert!(!valid(0.0, 0.0));
        assert!(!valid(91.0, 10.0));
        assert!(!valid(f64::NAN, 1.0));
    }
}
