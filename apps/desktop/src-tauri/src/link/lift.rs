//! v2 · Lift: phone → PC (LINK-v1 §6.5).
//!
//! The phone shares something into PinchDrop and pinches: it's "in the air". The PC shows it on the
//! Island and watches the webcam for an open hand (or the user presses Take it). Then the PC pulls
//! the files from the phone, saves them in Downloads\PinchDrop, and opens them.
//!
//! Safety: names from the phone are reduced to a plain, Windows-safe file name; nothing is ever
//! written outside the save folder. Partial files are deleted on any failure.

use super::*;
use std::collections::HashMap;
use std::sync::LazyLock;

/// Thumbnails larger than this are dropped (the card shows an icon instead).
const THUMB_MAX: usize = 96 * 1024;
/// Requests in flight while pulling a file.
const WINDOW: u64 = 4;
/// No chunk for this long → the lift failed.
const CHUNK_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_FILES: usize = 10_000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiftFile {
    name: String,
    size: u64,
    #[serde(default)]
    mime: String,
}

struct Lift {
    id: String,
    device_id: String,
    phone_name: String,
    label: String,
    files: Vec<LiftFile>,
    texts: Vec<String>,
    total_bytes: u64,
    thumb: Option<String>,
    started: Instant,
    total: Duration,
}

/// What the Island and the overlay show while something from the phone is in the air.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiftView {
    pub id: String,
    pub phone_name: String,
    pub label: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub expires_in_ms: u64,
    pub total_ms: u64,
    pub preview: crate::preview::Preview,
}

type ChunkTx = mpsc::UnboundedSender<(u64, u64, Vec<u8>)>;

#[derive(Default)]
struct LiftState {
    /// The one item currently in the air (not caught yet).
    current: Mutex<Option<Lift>>,
    /// Pulls in progress: lift id → (phone it comes from, where its chunks go).
    pulls: Mutex<HashMap<String, (String, ChunkTx)>>,
}

static LIFTS: LazyLock<LiftState> = LazyLock::new(LiftState::default);

/// A plain, Windows-safe file name from whatever the phone sent.
pub fn safe_name(raw: &str) -> String {
    let last = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = last
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        .collect();
    let mut name = cleaned
        .trim()
        .trim_end_matches(['.', ' '])
        .trim_start_matches('.')
        .to_string();
    if name.is_empty() {
        name = "file".into();
    }
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit());
    if reserved {
        name = format!("_{name}");
    }
    if name.chars().count() > 150 {
        let (stem, ext) = match name.rsplit_once('.') {
            Some((s, e)) if e.len() <= 10 => (s.to_string(), format!(".{e}")),
            _ => (name.clone(), String::new()),
        };
        name = format!(
            "{}{ext}",
            stem.chars()
                .take(150 - ext.chars().count())
                .collect::<String>()
        );
    }
    name
}

/// `dir\name`, or `dir\name (2).ext` … if that's taken.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (name.to_string(), String::new()),
    };
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .expect("some free name")
}

fn str_of<'a>(p: &'a Value, k: &str) -> &'a str {
    p.get(k).and_then(Value::as_str).unwrap_or_default()
}

fn preview_of(l: &Lift) -> crate::preview::Preview {
    use crate::preview::{kind_for_ext, Preview};
    if l.files.is_empty() {
        let t = l.texts.first().map(String::as_str).unwrap_or("");
        return if crate::clip::is_link(t) {
            let host = t
                .split("://")
                .nth(1)
                .and_then(|r| r.split('/').next())
                .unwrap_or("Link");
            crate::preview::for_link(t, host)
        } else {
            crate::preview::for_note(t)
        };
    }
    let first = &l.files[0];
    let ext = first
        .name
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_uppercase())
        .unwrap_or_default();
    let mut kind = kind_for_ext(&ext).to_string();
    if kind == "file" {
        if first.mime.starts_with("image/") {
            kind = "image".into();
        } else if first.mime.starts_with("video/") {
            kind = "video".into();
        }
    }
    let mut pv = Preview {
        kind,
        ext,
        thumb: l.thumb.clone(),
        ..Default::default()
    };
    if pv.thumb.is_some() {
        // The phone's thumbnail is square-ish; the card fits it in its own shape.
        pv.width = 4;
        pv.height = 3;
    }
    if l.files.len() > 1 {
        pv.kind = format!("multi:{}", pv.kind);
        pv.child_count = l.files.len() as u64;
        pv.children = l.files.iter().take(6).map(|f| f.name.clone()).collect();
    }
    pv
}

impl Link {
    fn lift_view_of(l: &Lift) -> LiftView {
        LiftView {
            id: l.id.clone(),
            phone_name: l.phone_name.clone(),
            label: l.label.clone(),
            file_count: l.files.len(),
            total_bytes: l.total_bytes,
            expires_in_ms: l.total.saturating_sub(l.started.elapsed()).as_millis() as u64,
            total_ms: l.total.as_millis() as u64,
            preview: preview_of(l),
        }
    }

    pub fn lift_view(&self) -> Option<LiftView> {
        LIFTS.current.lock().ok()?.as_ref().map(Self::lift_view_of)
    }

    /// Something from the phone is in the air (the webcam watches for an open hand).
    pub fn lift_pending(&self) -> bool {
        LIFTS.current.lock().map(|c| c.is_some()).unwrap_or(false)
    }

    fn emit_lift(&self) {
        let _ = self.app.emit("lift-changed", self.lift_view());
        // Arm (or disarm) the webcam straight away rather than on the next tick.
        if let Some(g) = self.app.try_state::<crate::grab::Grab>() {
            g.tick(&self.app);
        }
    }

    fn tell(&self, device_id: &str, kind: &str, payload: Value) {
        if let Some(tx) = self.session_tx(device_id) {
            let _ = tx.send(Out::Text(message(kind, payload)));
        }
    }

    /// `lift.offer` from a phone.
    pub(super) fn on_lift_offer(self: &Arc<Self>, device_id: &str, p: &Value) {
        let id = str_of(p, "liftId").to_string();
        if id.is_empty() || id.len() > 64 {
            return;
        }
        let files: Vec<LiftFile> = p
            .get("files")
            .and_then(|f| serde_json::from_value::<Vec<LiftFile>>(f.clone()).ok())
            .unwrap_or_default()
            .into_iter()
            .take(MAX_FILES)
            .map(|f| LiftFile {
                name: safe_name(&f.name),
                ..f
            })
            .collect();
        let texts: Vec<String> = p
            .get("texts")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .map(|s| s.chars().take(100_000).collect())
                    .collect()
            })
            .unwrap_or_default();
        if files.is_empty() && texts.is_empty() {
            return;
        }
        let thumb = Some(str_of(p, "thumb"))
            .filter(|t| t.len() <= THUMB_MAX)
            .filter(|t| {
                t.starts_with("data:image/jpeg;base64,") || t.starts_with("data:image/png;base64,")
            })
            .map(str::to_string);
        let secs = p
            .get("expiresInSecs")
            .and_then(Value::as_u64)
            .unwrap_or(30)
            .clamp(5, 120);
        let phone_name = self
            .devices
            .lock()
            .ok()
            .and_then(|d| d.get(device_id).map(|x| x.name.clone()))
            .unwrap_or_else(|| "Phone".into());
        let label = {
            let l: String = str_of(p, "label").chars().take(120).collect();
            if !l.trim().is_empty() {
                l
            } else if let Some(f) = files.first() {
                f.name.clone()
            } else {
                "Note".into()
            }
        };
        let lift = Lift {
            id: id.clone(),
            device_id: device_id.to_string(),
            phone_name,
            label,
            total_bytes: files.iter().map(|f| f.size).sum(),
            files,
            texts,
            thumb,
            started: Instant::now(),
            total: Duration::from_secs(secs),
        };
        // A newer lift replaces an older one that wasn't caught.
        let old = LIFTS.current.lock().ok().and_then(|mut c| c.replace(lift));
        if let Some(o) = old.filter(|o| o.id != id) {
            self.tell(
                &o.device_id,
                "lift.cancel",
                json!({ "liftId": o.id, "reason": "replaced" }),
            );
        }
        crate::force_show_pill(&self.app, secs + 2);
        let _ = self.app.emit_to("pill", "island-open", ());
        self.emit_lift();

        if p.get("sendNow").and_then(Value::as_bool).unwrap_or(false) {
            let _ = self.lift_catch(Some(&id));
            return;
        }
        // Not caught in time: tell the phone and put it away.
        let me = self.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(secs) + Duration::from_millis(300)).await;
            me.lift_drop(Some(&id), "expired");
        });
    }

    /// The phone took it back (or it failed there).
    pub(super) fn on_lift_cancel(&self, device_id: &str, p: &Value) {
        let id = str_of(p, "liftId");
        let was_current = LIFTS
            .current
            .lock()
            .map(|mut c| {
                if c.as_ref()
                    .is_some_and(|l| l.id == id && l.device_id == device_id)
                {
                    *c = None;
                    true
                } else {
                    false
                }
            })
            .unwrap_or(false);
        if was_current {
            self.emit_lift();
        }
        // A pull in progress stops at its next chunk.
        self.update_transfer(id, |t| {
            if t.is_active() && t.device_id == device_id {
                t.state = "cancelled".into();
                t.error = Some("Cancelled on the phone.".into());
                t.finished_at = Some(now_secs());
            }
        });
    }

    /// Puts the item away without taking it ("Not now", expired, phone gone).
    pub fn lift_drop(&self, id: Option<&str>, reason: &str) {
        let taken = LIFTS.current.lock().ok().and_then(|mut c| {
            if c.as_ref().is_some_and(|l| id.map_or(true, |i| i == l.id)) {
                c.take()
            } else {
                None
            }
        });
        if let Some(l) = taken {
            self.tell(
                &l.device_id,
                "lift.cancel",
                json!({ "liftId": l.id, "reason": reason }),
            );
            self.emit_lift();
        }
    }

    /// The phone dropped off: forget what it had in the air.
    pub(super) fn lift_device_gone(&self, device_id: &str) {
        let gone = LIFTS
            .current
            .lock()
            .map(|mut c| {
                if c.as_ref().is_some_and(|l| l.device_id == device_id) {
                    *c = None;
                    true
                } else {
                    false
                }
            })
            .unwrap_or(false);
        if gone {
            self.emit_lift();
        }
    }

    /// Catch it: an open hand at the webcam, or Take it on the Island.
    pub fn lift_catch(self: &Arc<Self>, id: Option<&str>) -> Result<(), String> {
        let lift = LIFTS
            .current
            .lock()
            .ok()
            .and_then(|mut c| {
                if c.as_ref().is_some_and(|l| id.map_or(true, |i| i == l.id)) {
                    c.take()
                } else {
                    None
                }
            })
            .ok_or("Nothing from the phone is waiting any more.")?;
        let Some(tx) = self.session_tx(&lift.device_id) else {
            self.emit_lift();
            return Err("The phone isn't connected any more.".into());
        };
        let _ = tx.send(Out::Text(message(
            "lift.catch",
            json!({ "liftId": lift.id }),
        )));
        self.emit_lift();

        let dir = save_dir(&self.app);
        if lift.files.is_empty() {
            let opened = land_texts(&self.app, &dir, &lift.texts);
            let _ = tx.send(Out::Text(message(
                "lift.done",
                json!({ "liftId": lift.id, "opened": opened }),
            )));
            return Ok(());
        }

        let t = Transfer {
            id: lift.id.clone(),
            device_id: lift.device_id.clone(),
            device_name: lift.phone_name.clone(),
            label: lift.label.clone(),
            created_at: now_secs(),
            finished_at: None,
            state: "sending".into(),
            error: None,
            mode: "copy".into(),
            destination: String::new(),
            open_first: false,
            files: lift
                .files
                .iter()
                .map(|f| transfer::FileEntry {
                    path: f.name.clone(),
                    source: String::new(),
                    size: f.size,
                })
                .collect(),
            texts: Vec::new(),
            roots: Vec::new(),
            hold_id: None,
            total_bytes: lift.total_bytes,
            files_done: 0,
            bytes_done: 0,
            moved: false,
            direction: "in".into(),
        };
        if let Ok(mut ts) = self.transfers.lock() {
            ts.push(t);
        }
        self.save_transfers();
        self.emit_transfers(true);

        let me = self.clone();
        tauri::async_runtime::spawn(async move {
            let result = me.pull(&lift, &tx, &dir).await;
            if let Ok(mut p) = LIFTS.pulls.lock() {
                p.remove(&lift.id);
            }
            match result {
                Ok(saved) => {
                    me.update_transfer(&lift.id, |t| {
                        t.state = "done".into();
                        t.files_done = t.files.len() as u32;
                        t.bytes_done = t.total_bytes;
                        t.finished_at = Some(now_secs());
                    });
                    let _ = tx.send(Out::Text(message(
                        "lift.done",
                        json!({ "liftId": lift.id, "opened": true }),
                    )));
                    open_landed(&me.app, &dir, &saved);
                }
                Err(reason) => {
                    me.update_transfer(&lift.id, |t| {
                        if t.is_active() {
                            t.state = "failed".into();
                            t.error = Some(reason.clone());
                            t.finished_at = Some(now_secs());
                        }
                    });
                    let _ = tx.send(Out::Text(message(
                        "lift.cancel",
                        json!({ "liftId": lift.id, "reason": "failed" }),
                    )));
                }
            }
            me.save_transfers();
            me.emit_transfers(true);
        });
        Ok(())
    }

    /// Pulls every file of a caught lift. Returns where they were saved.
    async fn pull(&self, lift: &Lift, tx: &Tx, dir: &Path) -> Result<Vec<PathBuf>, String> {
        use std::io::Write;
        std::fs::create_dir_all(dir)
            .map_err(|_| "Couldn't create the Downloads\\PinchDrop folder.".to_string())?;
        let (ctx, mut crx) = mpsc::unbounded_channel();
        if let Ok(mut p) = LIFTS.pulls.lock() {
            p.insert(lift.id.clone(), (lift.device_id.clone(), ctx));
        }
        let mut saved = Vec::new();
        let mut before = 0u64;
        for (index, f) in lift.files.iter().enumerate() {
            let index = index as u64;
            let dest = unique_path(dir, &f.name);
            let part = dest.with_file_name(format!(
                "{}.pinchdrop-part",
                dest.file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default()
            ));
            let mut out = std::fs::File::create(&part)
                .map_err(|_| "Couldn't write to Downloads\\PinchDrop.".to_string())?;
            let cleanup = |p: &Path| {
                let _ = std::fs::remove_file(p);
            };
            let mut offset = 0u64;
            let mut requested = 0u64;
            let mut in_flight = 0u64;
            while offset < f.size {
                while in_flight < WINDOW && requested < f.size {
                    let len = CHUNK_MAX.min(f.size - requested);
                    let req = json!({ "liftId": lift.id, "index": index, "offset": requested, "length": len });
                    if tx.send(Out::Text(message("lift.req", req))).is_err() {
                        cleanup(&part);
                        return Err("The phone disconnected.".into());
                    }
                    requested += len;
                    in_flight += 1;
                }
                let got = timeout(CHUNK_TIMEOUT, crx.recv()).await;
                let Ok(Some((i, o, data))) = got else {
                    cleanup(&part);
                    return Err("The phone stopped sending.".into());
                };
                if i != index || o != offset {
                    continue; // stale or out of order: ignore
                }
                if data.is_empty() || offset + data.len() as u64 > f.size {
                    cleanup(&part);
                    return Err("The phone sent something unexpected.".into());
                }
                if out.write_all(&data).is_err() {
                    cleanup(&part);
                    return Err("Couldn't write the file (is the disk full?).".into());
                }
                offset += data.len() as u64;
                in_flight -= 1;
                let still = self
                    .update_transfer(&lift.id, |t| {
                        t.bytes_done = before + offset;
                        t.state == "sending"
                    })
                    .unwrap_or(false);
                if !still {
                    cleanup(&part);
                    self.tell(
                        &lift.device_id,
                        "lift.cancel",
                        json!({ "liftId": lift.id, "reason": "cancelled" }),
                    );
                    return Err("Cancelled.".into());
                }
                self.emit_transfers(false);
            }
            let _ = out.flush();
            drop(out);
            std::fs::rename(&part, &dest).map_err(|_| {
                cleanup(&part);
                "Couldn't finish saving the file.".to_string()
            })?;
            before += f.size;
            self.update_transfer(&lift.id, |t| {
                t.files_done = index as u32 + 1;
                if let Some(e) = t.files.get_mut(index as usize) {
                    e.source = dest.to_string_lossy().into_owned();
                }
            });
            saved.push(dest);
        }
        Ok(saved)
    }

    /// A binary frame from a phone: a chunk for a lift being pulled.
    pub(super) fn on_lift_chunk(&self, device_id: &str, frame: &[u8]) {
        let Some((t, i, o, data)) = split_frame(frame) else {
            return;
        };
        let sender = LIFTS.pulls.lock().ok().and_then(|p| {
            p.get(&t)
                .filter(|(dev, _)| dev == device_id)
                .map(|(_, s)| s.clone())
        });
        if let Some(s) = sender {
            let _ = s.send((i, o, data));
        }
    }
}

/// `u32 headerLength ‖ header JSON ‖ data` → (lift id, index, offset, data).
pub fn split_frame(frame: &[u8]) -> Option<(String, u64, u64, Vec<u8>)> {
    let n = u32::from_be_bytes(frame.get(..4)?.try_into().ok()?) as usize;
    let header: Value = serde_json::from_slice(frame.get(4..4 + n)?).ok()?;
    Some((
        header.get("t")?.as_str()?.to_string(),
        header.get("i")?.as_u64()?,
        header.get("o")?.as_u64()?,
        frame.get(4 + n..)?.to_vec(),
    ))
}

/// Where things from the phone land.
pub fn save_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .download_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("PinchDrop")
}

/// Links open in the browser, short text goes on the clipboard, long text becomes a note that opens.
fn land_texts(app: &AppHandle, dir: &Path, texts: &[String]) -> bool {
    use tauri_plugin_opener::OpenerExt;
    let mut opened = false;
    for t in texts {
        match crate::clip::classify(t) {
            crate::clip::TextPlan::Link(url) => {
                opened |= app.opener().open_url(url, None::<&str>).is_ok();
            }
            crate::clip::TextPlan::Short(s) => {
                opened |= crate::clip::write(&s);
            }
            crate::clip::TextPlan::Long(l) => {
                if let Ok(p) = crate::clip::write_note(dir, &l, None) {
                    opened |= app
                        .opener()
                        .open_path(p.to_string_lossy(), None::<&str>)
                        .is_ok();
                }
            }
        }
    }
    opened
}

/// One file opens in its app; several open the folder.
fn open_landed(app: &AppHandle, dir: &Path, saved: &[PathBuf]) {
    use tauri_plugin_opener::OpenerExt;
    let target = if saved.len() == 1 {
        saved[0].clone()
    } else {
        dir.to_path_buf()
    };
    let _ = app
        .opener()
        .open_path(target.to_string_lossy(), None::<&str>);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_from_the_phone_are_made_safe() {
        assert_eq!(safe_name("IMG_2041.jpg"), "IMG_2041.jpg");
        assert_eq!(safe_name("../../Windows/system32/evil.dll"), "evil.dll");
        assert_eq!(safe_name("..\\..\\boot.ini"), "boot.ini");
        assert_eq!(safe_name("a<b>c:d\"e|f?g*.txt"), "abcdefg.txt");
        assert_eq!(safe_name("CON.txt"), "_CON.txt");
        assert_eq!(safe_name("com1"), "_com1");
        assert_eq!(safe_name("  ...  "), "file");
        assert_eq!(safe_name(".hidden"), "hidden");
        let long = format!("{}.mp4", "x".repeat(300));
        let s = safe_name(&long);
        assert!(s.ends_with(".mp4") && s.chars().count() == 150);
    }

    #[test]
    fn clashing_names_get_a_number() {
        let dir = std::env::temp_dir().join(format!("pd-lift-{}", random_id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(unique_path(&dir, "a.txt"), dir.join("a.txt"));
        std::fs::write(dir.join("a.txt"), "1").unwrap();
        std::fs::write(dir.join("a (2).txt"), "2").unwrap();
        assert_eq!(unique_path(&dir, "a.txt"), dir.join("a (3).txt"));
        std::fs::write(dir.join("README"), "").unwrap();
        assert_eq!(unique_path(&dir, "README"), dir.join("README (2)"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_chunk_frames() {
        let header = br#"{"t":"L1","i":2,"o":1024}"#;
        let mut f = (header.len() as u32).to_be_bytes().to_vec();
        f.extend_from_slice(header);
        f.extend_from_slice(b"data");
        assert_eq!(
            split_frame(&f),
            Some(("L1".into(), 2, 1024, b"data".to_vec()))
        );
        assert_eq!(split_frame(&[0, 0, 0, 99, 1]), None);
    }
}
