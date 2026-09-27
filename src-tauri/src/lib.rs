pub mod commands;
pub mod db;
pub mod error;
pub mod filesystem;
pub mod process;
pub mod state;

use filesystem::paths::SystemEnvironment;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            environment: Box::new(SystemEnvironment),
        })
        .invoke_handler(tauri::generate_handler![
            commands::detection::detect_terminals,
            commands::backups::create_config_backup,
            commands::files::write_file_atomically,
            commands::validation::validate_candidate
        ])
        .run(tauri::generate_context!())
        .expect("error while running Config Forge");
}
