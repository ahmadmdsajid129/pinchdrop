use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileOpType {
    Move { from: PathBuf, to: PathBuf },
    Rename { from: PathBuf, to: PathBuf },
    Recycle { original_path: PathBuf },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoEntry {
    pub id: String,
    pub operation: FileOpType,
    pub timestamp_ms: u64,
    pub is_reverted: bool,
}

pub struct UndoJournal {
    entries: Vec<UndoEntry>,
    max_history: usize,
}

impl UndoJournal {
    pub fn new(max_history: usize) -> Self {
        Self {
            entries: Vec::new(),
            max_history,
        }
    }

    pub fn record_op(&mut self, op: FileOpType) -> String {
        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let id = format!("undo_{}", timestamp_ms);
        let entry = UndoEntry {
            id: id.clone(),
            operation: op,
            timestamp_ms,
            is_reverted: false,
        };

        self.entries.push(entry);
        if self.entries.len() > self.max_history {
            self.entries.remove(0);
        }

        id
    }

    pub fn get_latest(&self) -> Option<&UndoEntry> {
        self.entries.iter().rev().find(|e| !e.is_reverted)
    }

    pub fn mark_reverted(&mut self, id: &str) -> bool {
        if let Some(entry) = self.entries.iter_mut().find(|e| e.id == id) {
            entry.is_reverted = true;
            true
        } else {
            false
        }
    }
}
