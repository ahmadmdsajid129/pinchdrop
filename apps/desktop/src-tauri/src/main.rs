#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod allowlist;
mod journal;
mod trash_ops;

use allowlist::AllowList;
use journal::{FileOpType, UndoJournal};
use std::path::PathBuf;
use std::sync::Mutex;

struct AppState {
    allow_list: AllowList,
    undo_journal: Mutex<UndoJournal>,
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
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            safe_move_file,
            safe_recycle_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
