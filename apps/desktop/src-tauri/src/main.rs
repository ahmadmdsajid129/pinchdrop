#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod allowlist;
mod journal;
mod pairing;
mod server;
mod stage_tray;
mod transfer;
mod trash_ops;

use allowlist::AllowList;
use journal::{FileOpType, UndoJournal};
use pairing::{KeyStore, PairedDevice, QrPairingPayload};
use server::{LanServer, ServerConfig};
use stage_tray::{StageItem, StageTrayManager};
use std::path::PathBuf;
use std::sync::Mutex;

struct AppState {
    allow_list: AllowList,
    undo_journal: Mutex<UndoJournal>,
    key_store: Mutex<KeyStore>,
    lan_server: Mutex<LanServer>,
    stage_tray: Mutex<StageTrayManager>,
}

#[tauri::command]
fn get_pairing_qr_payload(state: tauri::State<AppState>) -> QrPairingPayload {
    let _keystore = state.key_store.lock().unwrap();
    QrPairingPayload {
        device_id: "pc_desktop_primary".to_string(),
        device_name: "PinchDrop Windows PC".to_string(),
        public_key: "ed25519_pub_sample_key_4821".to_string(),
        cert_fingerprint: "SHA256:7C:5C:FF:22:D3:EE:34:D3:99".to_string(),
        nonce: format!("nonce_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()),
        addresses: vec!["192.168.1.105".to_string()],
        port: 49152,
    }
}

#[tauri::command]
fn register_phone_device(
    device: PairedDevice,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let mut keystore = state.key_store.lock().unwrap();
    let name = device.name.clone();
    keystore.add_device(device);
    Ok(format!("Device '{}' paired successfully with certificate pinned", name))
}

#[tauri::command]
fn simulate_phone_grab(state: tauri::State<AppState>) -> StageItem {
    let mut tray = state.stage_tray.lock().unwrap();
    let item = StageItem {
        item_id: format!("item_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()),
        file_name: "IMG_20261125_Camera.jpg".to_string(),
        mime_type: "image/jpeg".to_string(),
        file_size: 4_290_100,
        thumbnail_b64: None,
        received_at_ms: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64,
        is_caught: false,
    };
    tray.arm_item(item.clone());
    item
}

#[tauri::command]
fn catch_held_item(item_id: String, state: tauri::State<AppState>) -> Result<StageItem, String> {
    let mut tray = state.stage_tray.lock().unwrap();
    tray.catch_item(&item_id).ok_or_else(|| "Item not found or already caught".to_string())
}

#[tauri::command]
fn safe_move_file(
    from: String,
    to: String,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let from_path = state
        .allow_list
        .validate_path(&PathBuf::from(&from))
        .map_err(|e| format!("Source path safety error: {:?}", e))?;

    let to_path = state
        .allow_list
        .validate_path(&PathBuf::from(&to))
        .map_err(|e| format!("Destination path safety error: {:?}", e))?;

    std::fs::rename(&from_path, &to_path)
        .map_err(|e| format!("Filesystem rename error: {}", e))?;

    let mut journal = state.undo_journal.lock().unwrap();
    let undo_id = journal.record_op(FileOpType::Move {
        from: from_path,
        to: to_path,
    });

    Ok(undo_id)
}

#[tauri::command]
fn safe_recycle_file(
    path: String,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let validated = state
        .allow_list
        .validate_path(&PathBuf::from(&path))
        .map_err(|e| format!("Path safety error: {:?}", e))?;

    trash_ops::move_to_recycle_bin(&validated)
        .map_err(|e| format!("Recycle Bin error: {:?}", e))?;

    let mut journal = state.undo_journal.lock().unwrap();
    let undo_id = journal.record_op(FileOpType::Recycle {
        original_path: validated,
    });

    Ok(undo_id)
}

fn main() {
    let home = std::env::var("USERPROFILE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));

    let state = AppState {
        allow_list: AllowList::new(vec![home]),
        undo_journal: Mutex::new(UndoJournal::new(100)),
        key_store: Mutex::new(KeyStore::new()),
        lan_server: Mutex::new(LanServer::new(ServerConfig::default())),
        stage_tray: Mutex::new(StageTrayManager::new()),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            safe_move_file,
            safe_recycle_file,
            get_pairing_qr_payload,
            register_phone_device,
            simulate_phone_grab,
            catch_held_item
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
