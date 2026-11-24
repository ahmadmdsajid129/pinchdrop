use blake3::Hasher;
use serde::{Deserialize, Serialize};

pub const DEFAULT_CHUNK_SIZE: usize = 1024 * 1024; // 1 MB chunk standard

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkManifest {
    pub transfer_id: String,
    pub file_name: String,
    pub total_bytes: u64,
    pub chunk_size: usize,
    pub total_chunks: usize,
    pub full_blake3_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkVerification {
    pub chunk_index: usize,
    pub byte_offset: u64,
    pub byte_length: usize,
    pub chunk_hash: String,
    pub is_valid: bool,
}

pub struct TransferEngine;

impl TransferEngine {
    pub fn compute_hash(data: &[u8]) -> String {
        let mut hasher = Hasher::new();
        hasher.update(data);
        hasher.finalize().to_hex().to_string()
    }

    pub fn create_manifest(
        transfer_id: String,
        file_name: String,
        total_bytes: u64,
        full_hash: String,
    ) -> ChunkManifest {
        let total_chunks = ((total_bytes as f64) / (DEFAULT_CHUNK_SIZE as f64)).ceil() as usize;
        ChunkManifest {
            transfer_id,
            file_name,
            total_bytes,
            chunk_size: DEFAULT_CHUNK_SIZE,
            total_chunks: if total_chunks == 0 { 1 } else { total_chunks },
            full_blake3_hash: full_hash,
        }
    }

    pub fn verify_chunk(
        chunk_index: usize,
        byte_offset: u64,
        data: &[u8],
        expected_hash: &str,
    ) -> ChunkVerification {
        let actual_hash = Self::compute_hash(data);
        ChunkVerification {
            chunk_index,
            byte_offset,
            byte_length: data.len(),
            chunk_hash: actual_hash.clone(),
            is_valid: actual_hash == expected_hash,
        }
    }
}
