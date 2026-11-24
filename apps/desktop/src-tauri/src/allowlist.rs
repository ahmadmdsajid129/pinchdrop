use std::path::{Path, PathBuf};

/// Safe File Operations Allow-List Engine
/// Ensures all file system access remains strictly contained within user-approved folder roots.
pub struct AllowList {
    allowed_roots: Vec<PathBuf>,
}

#[derive(Debug, PartialEq)]
pub enum FileSafetyError {
    PathTraversalDetected,
    OutsideAllowList,
    InvalidCharacters,
    ReservedWindowsName,
    NotFound,
}

impl AllowList {
    pub fn new(roots: Vec<PathBuf>) -> Self {
        let mut canonical_roots = Vec::new();
        for r in roots {
            if let Ok(canon) = r.canonicalize() {
                canonical_roots.push(canon);
            } else {
                canonical_roots.push(r);
            }
        }
        Self { allowed_roots: canonical_roots }
    }

    /// Validates whether a given target path is strictly inside an allowed root
    pub fn validate_path(&self, target: &Path) -> Result<PathBuf, FileSafetyError> {
        // Guard 1: Check Windows forbidden characters (< > : " | ? *)
        let file_name_str = target.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if file_name_str.contains(['<', '>', ':', '"', '|', '?', '*']) {
            return Err(FileSafetyError::InvalidCharacters);
        }

        // Guard 2: Check Windows reserved device names
        let stem = target.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_uppercase();
        let reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "LPT1", "LPT2", "LPT3"];
        if reserved.contains(&stem.as_str()) {
            return Err(FileSafetyError::ReservedWindowsName);
        }

        // Guard 3: Block explicit path traversal segments
        for component in target.components() {
            if component.as_os_str() == ".." {
                return Err(FileSafetyError::PathTraversalDetected);
            }
        }

        // Guard 4: Verify containment within at least one user-approved root
        let canonical_target = target.canonicalize().map_err(|_| FileSafetyError::NotFound)?;
        let is_contained = self.allowed_roots.iter().any(|root| canonical_target.starts_with(root));

        if !is_contained {
            return Err(FileSafetyError::OutsideAllowList);
        }

        Ok(canonical_target)
    }
}
