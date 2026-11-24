use std::path::Path;
use trash;

#[derive(Debug)]
pub enum TrashError {
    OperationFailed(String),
}

/// Safely moves a file to the OS Recycle Bin
/// Guaranteed: Never permanently deletes files via raw filesystem unlinking.
pub fn move_to_recycle_bin(path: &Path) -> Result<(), TrashError> {
    trash::delete(path).map_err(|e| TrashError::OperationFailed(e.to_string()))
}
