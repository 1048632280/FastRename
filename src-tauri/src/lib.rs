mod commands;
mod domain;
mod platform;

use commands::{
    get_settings, list_files, rename_file, resolve_drop_target, save_settings, undo_last_rename,
};
use domain::rename_history::RenameHistory;
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    pub history: Mutex<RenameHistory>,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            list_files,
            resolve_drop_target,
            rename_file,
            undo_last_rename,
            get_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("failed to run FastRename");
}
