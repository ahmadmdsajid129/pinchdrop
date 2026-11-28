//! Phase 4: what a send is made of (LINK-v1 §6). Builds the file list from the
//! items the user picked, and keeps the transfer records shown on the Transfers
//! screen. The phone can only ever ask for files by their index in this list,
//! never by path — so it can't read anything the user didn't pick.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path};

/// Largest chunk the PC sends in one frame (2 MiB: fast mode, LINK-v1 §6.7; older phones ask for 512 KiB).
pub const CHUNK_MAX: u64 = 2_097_152;
/// Chunk size the PC asks the phone for when pulling a lift (§6.5).
pub const LIFT_CHUNK: u64 = 524_288;
/// Stop listing a folder after this many files.
const MAX_FILES: usize = 200_000;
/// How many finished transfers to keep in history.
pub const HISTORY_MAX: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    /// Relative path the phone sees, `/`-separated (e.g. "CPP/src/main.cpp").
    pub path: String,
    /// Absolute source path on this PC. Cleared once the transfer finishes.
    pub source: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Transfer {
    pub id: String,
    pub device_id: String,
    pub device_name: String,
    pub label: String,
    pub created_at: u64,
    pub finished_at: Option<u64>,
    /// offered | sending | paused | done | declined | failed | cancelled
    pub state: String,
    pub error: Option<String>,
    pub mode: String,
    pub destination: String,
    pub open_first: bool,
    pub files: Vec<FileEntry>,
    pub texts: Vec<String>,
    /// The items the user picked (used for Move → Recycle Bin). Cleared when finished.
    pub roots: Vec<String>,
    /// Set when this send is a caught hold (P5/P6): the phone accepts it without asking.
    #[serde(default)]
    pub hold_id: Option<String>,
    pub total_bytes: u64,
    pub files_done: u32,
    pub bytes_done: u64,
    pub moved: bool,
    /// "out" (PC → phone, the default) or "in" (a lift from the phone, v2).
    #[serde(default)]
    pub direction: String,
    /// A finished transfer keeps only its first file; these remember how many there were.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_total: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_total: Option<usize>,
}

impl Transfer {
    pub fn is_active(&self) -> bool {
        matches!(self.state.as_str(), "offered" | "sending" | "paused")
    }

    /// Bytes of all files before `index` — used for progress.
    pub fn bytes_before(&self, index: usize) -> u64 {
        self.files.iter().take(index).map(|f| f.size).sum()
    }

    /// v2.0.1 · History keeps only what the Transfers list shows: the count, the first file's
    /// name, the number of texts. A finished folder of 5,000 files used to keep all 5,000 names
    /// in memory and in transfers.json for good.
    pub fn compact(&mut self) {
        if self.is_active() {
            return;
        }
        self.scrub();
        if self.files.len() > 1 {
            self.file_total = Some(self.file_total.unwrap_or(0).max(self.files.len()));
            self.files.truncate(1);
            self.files.shrink_to_fit();
        }
        if !self.texts.is_empty() {
            self.text_total = Some(self.text_total.unwrap_or(0).max(self.texts.len()));
            self.texts = Vec::new();
        }
    }

    /// Forget local paths once a transfer is over (history keeps names and sizes only).
    pub fn scrub(&mut self) {
        for f in &mut self.files {
            f.source.clear();
        }
        self.roots.clear();
    }
}

/// What the Transfers screen shows (no local paths).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferView {
    pub id: String,
    /// Which device (v2: the Phone files page refreshes when a send to it finishes).
    pub device_id: String,
    pub device_name: String,
    pub label: String,
    pub created_at: u64,
    pub finished_at: Option<u64>,
    pub state: String,
    pub error: Option<String>,
    pub mode: String,
    pub file_count: usize,
    pub text_count: usize,
    pub total_bytes: u64,
    pub files_done: u32,
    pub bytes_done: u64,
    pub moved: bool,
    pub first_name: Option<String>,
    /// "out" or "in".
    pub direction: String,
}

impl From<&Transfer> for TransferView {
    fn from(t: &Transfer) -> Self {
        Self {
            id: t.id.clone(),
            device_id: t.device_id.clone(),
            device_name: t.device_name.clone(),
            label: t.label.clone(),
            created_at: t.created_at,
            finished_at: t.finished_at,
            state: t.state.clone(),
            error: t.error.clone(),
            mode: t.mode.clone(),
            file_count: t.file_total.unwrap_or(t.files.len()),
            text_count: t.text_total.unwrap_or(t.texts.len()),
            total_bytes: t.total_bytes,
            files_done: t.files_done,
            bytes_done: t.bytes_done,
            moved: t.moved,
            first_name: t
                .files
                .first()
                .map(|f| f.path.rsplit('/').next().unwrap_or(&f.path).to_string()),
            direction: if t.direction == "in" {
                "in".into()
            } else {
                "out".into()
            },
        }
    }
}

/// A picked path must be absolute and must not climb out with `..`.
pub fn safe_source(p: &str) -> Result<&Path, String> {
    let path = Path::new(p);
    if !path.is_absolute() {
        return Err(format!("Not a full path: {p}"));
    }
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(format!("Path not allowed: {p}"));
    }
    Ok(path)
}

fn name_of(p: &Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "item".into())
}

fn walk(dir: &Path, rel: &str, out: &mut Vec<FileEntry>) -> Result<(), String> {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("{}: {e}", dir.display()))?
        .flatten()
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        if out.len() >= MAX_FILES {
            return Err(format!(
                "More than {MAX_FILES} files — send a smaller folder."
            ));
        }
        // symlink_metadata: never follow links out of what the user picked.
        let Ok(meta) = fs::symlink_metadata(entry.path()) else {
            continue;
        };
        let child = format!("{rel}/{}", entry.file_name().to_string_lossy());
        if meta.is_dir() {
            walk(&entry.path(), &child, out)?;
        } else if meta.is_file() {
            out.push(FileEntry {
                path: child,
                source: entry.path().to_string_lossy().into_owned(),
                size: meta.len(),
            });
        }
    }
    Ok(())
}

/// Turns the picked paths into the flat file list of an offer. Returns (files, label).
pub fn build_manifest(paths: &[String]) -> Result<(Vec<FileEntry>, String), String> {
    let mut files = Vec::new();
    for p in paths {
        let path = safe_source(p)?;
        let meta = fs::symlink_metadata(path).map_err(|e| format!("{}: {e}", path.display()))?;
        let name = name_of(path);
        if meta.is_dir() {
            walk(path, &name, &mut files)?;
        } else if meta.is_file() {
            files.push(FileEntry {
                path: name,
                source: p.clone(),
                size: meta.len(),
            });
        }
    }
    let label = match paths {
        [one] => name_of(Path::new(one)),
        _ => format!("{} items", paths.len()),
    };
    Ok((files, label))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!(
            "pd-xfer-{tag}-{}",
            super::super::proto::random_id()
        ));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn folder_becomes_relative_sorted_list() {
        let root = tmp("m");
        let cpp = root.join("CPP");
        fs::create_dir_all(cpp.join("src")).unwrap();
        fs::write(cpp.join("b.txt"), b"bb").unwrap();
        fs::write(cpp.join("src").join("main.cpp"), b"int main(){}").unwrap();
        let single = root.join("photo.jpg");
        fs::write(&single, b"jpg").unwrap();
        let (files, label) = build_manifest(&[
            cpp.to_string_lossy().into(),
            single.to_string_lossy().into(),
        ])
        .unwrap();
        let paths: Vec<_> = files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, ["CPP/b.txt", "CPP/src/main.cpp", "photo.jpg"]);
        assert_eq!(files[1].size, 12);
        assert_eq!(label, "2 items");
        let (_, one) = build_manifest(&[cpp.to_string_lossy().into()]).unwrap();
        assert_eq!(one, "CPP");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_relative_and_parent_paths() {
        assert!(safe_source("relative/path").is_err());
        let root = tmp("p");
        let sneaky = format!(
            "{}{}..{}x",
            root.display(),
            std::path::MAIN_SEPARATOR,
            std::path::MAIN_SEPARATOR
        );
        assert!(safe_source(&sneaky).is_err());
        assert!(safe_source(&root.to_string_lossy()).is_ok());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn progress_helpers_and_scrub() {
        let mut t = Transfer {
            id: "t".into(),
            device_id: "d".into(),
            device_name: "Pixel".into(),
            label: "x".into(),
            created_at: 0,
            finished_at: None,
            state: "sending".into(),
            error: None,
            mode: "copy".into(),
            destination: "auto".into(),
            open_first: false,
            files: vec![
                FileEntry {
                    path: "a".into(),
                    source: "C:\\a".into(),
                    size: 10,
                },
                FileEntry {
                    path: "b".into(),
                    source: "C:\\b".into(),
                    size: 5,
                },
            ],
            texts: vec![],
            roots: vec!["C:\\a".into()],
            hold_id: None,
            total_bytes: 15,
            files_done: 0,
            bytes_done: 0,
            moved: false,
            direction: String::new(),
            file_total: None,
            text_total: None,
        };
        assert_eq!(t.bytes_before(1), 10);
        assert!(t.is_active());
        t.scrub();
        assert!(t.files.iter().all(|f| f.source.is_empty()) && t.roots.is_empty());
        assert_eq!(TransferView::from(&t).first_name.as_deref(), Some("a"));

        // v2.0.1: an active transfer is never compacted…
        t.compact();
        assert_eq!(t.files.len(), 2);
        // …a finished one keeps one file but still reports them all.
        t.files = (0..5000)
            .map(|i| FileEntry {
                path: format!("f{i}"),
                source: String::new(),
                size: 1,
            })
            .collect();
        t.texts = vec!["hello".into(), "world".into()];
        t.state = "done".into();
        t.compact();
        t.compact(); // twice is the same as once
        assert_eq!(t.files.len(), 1);
        assert!(t.texts.is_empty());
        let v = TransferView::from(&t);
        assert_eq!(
            (v.file_count, v.text_count, v.first_name.as_deref()),
            (5000, 2, Some("f0"))
        );
        // and survives a save / load
        let back: Transfer = serde_json::from_str(&serde_json::to_string(&t).unwrap()).unwrap();
        assert_eq!(TransferView::from(&back).file_count, 5000);
    }
}
