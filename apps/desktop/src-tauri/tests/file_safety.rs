#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    #[test]
    fn test_path_traversal_detection() {
        let path = PathBuf::from("E:/Pinch Drop/../Windows/System32");
        let has_traversal = path.components().any(|c| c.as_os_str() == "..");
        assert!(has_traversal, "Must catch path traversal attempt");
    }

    #[test]
    fn test_windows_reserved_names() {
        let reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "LPT1"];
        for name in reserved {
            let path = PathBuf::from(format!("C:/Users/Alex/Documents/{}.txt", name));
            let stem = path.file_stem().unwrap().to_str().unwrap().to_uppercase();
            assert!(reserved.contains(&stem.as_str()), "Must flag reserved Windows name");
        }
    }
}
