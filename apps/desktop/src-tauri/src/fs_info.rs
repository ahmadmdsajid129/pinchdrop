//! Read-only facts about files the user picked to send (name, size, how many
//! files a folder holds). Never writes or deletes anything.

use serde::Serialize;
use std::fs;
use std::path::Path;

/// Stop counting a folder after this many entries so a huge tree can't hang the UI.
const MAX_ENTRIES: u64 = 200_000;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PathInfo {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub file_count: u64,
    /// True when the folder was too big to count fully.
    pub partial: bool,
    pub error: Option<String>,
}

fn walk(dir: &Path, bytes: &mut u64, files: &mut u64, seen: &mut u64) -> bool {
    let Ok(entries) = fs::read_dir(dir) else { return true };
    for entry in entries.flatten() {
        *seen += 1;
        if *seen > MAX_ENTRIES {
            return false;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            if !walk(&entry.path(), bytes, files, seen) {
                return false;
            }
        } else if meta.is_file() {
            *bytes += meta.len();
            *files += 1;
        }
    }
    true
}

pub fn inspect(path: &str) -> PathInfo {
    let p = Path::new(path);
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());
    let mut info = PathInfo {
        path: path.to_string(),
        name,
        is_dir: false,
        size_bytes: 0,
        file_count: 0,
        partial: false,
        error: None,
    };
    // symlink_metadata: never follow links out of what the user picked.
    match fs::symlink_metadata(p) {
        Ok(meta) if meta.is_dir() => {
            info.is_dir = true;
            let (mut bytes, mut files, mut seen) = (0, 0, 0);
            info.partial = !walk(p, &mut bytes, &mut files, &mut seen);
            info.size_bytes = bytes;
            info.file_count = files;
        }
        Ok(meta) => {
            info.size_bytes = meta.len();
            info.file_count = 1;
        }
        Err(e) => info.error = Some(e.to_string()),
    }
    info
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_files_in_nested_folders() {
        let root = std::env::temp_dir().join(format!("pd_fsinfo_{}", std::process::id()));
        let sub = root.join("sub");
        fs::create_dir_all(&sub).unwrap();
        fs::write(root.join("a.txt"), b"hello").unwrap();
        fs::write(sub.join("b.txt"), b"world!").unwrap();
        let info = inspect(&root.to_string_lossy());
        assert!(info.is_dir);
        assert_eq!(info.file_count, 2);
        assert_eq!(info.size_bytes, 11);
        assert!(!info.partial);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn missing_path_reports_error() {
        let info = inspect("Z:/definitely/not/here.bin");
        assert!(info.error.is_some());
    }
}
