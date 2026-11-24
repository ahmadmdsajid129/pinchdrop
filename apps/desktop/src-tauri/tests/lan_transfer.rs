#[cfg(test)]
mod tests {
    use blake3::Hasher;

    #[test]
    fn test_blake3_chunk_hashing() {
        let chunk_data = b"PinchDrop 1MB chunk simulated payload";
        let mut hasher = Hasher::new();
        hasher.update(chunk_data);
        let hash = hasher.finalize().to_hex().to_string();

        assert_eq!(hash.len(), 64, "BLAKE3 hash should be 64 hex characters (256-bit)");
    }

    #[test]
    fn test_chunk_manifest_split() {
        let file_size: u64 = 5 * 1024 * 1024; // 5 MB
        let chunk_size: u64 = 1024 * 1024;     // 1 MB
        let total_chunks = ((file_size as f64) / (chunk_size as f64)).ceil() as usize;

        assert_eq!(total_chunks, 5, "5 MB file must partition into exactly 5 1MB chunks");
    }
}
