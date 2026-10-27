pub mod commands;
pub mod db;
pub mod error;
pub mod filesystem;
pub mod process;
pub mod state;

use filesystem::paths::SystemEnvironment;
use state::AppState;
use tauri::{Manager, Runtime};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// Every command the frontend may invoke. Anything not listed here (the
/// shell and fs plugins included) is unreachable from the webview.
pub fn command_handler<R: Runtime>(
) -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        commands::detection::detect_terminals,
        commands::files::get_app_paths,
        commands::projects::create_project,
        commands::projects::get_project,
        commands::projects::list_projects,
        commands::projects::save_project,
        commands::projects::create_snapshot,
        commands::projects::get_snapshot,
        commands::projects::list_snapshots,
        commands::templates::list_templates,
        commands::templates::get_template,
        commands::templates::create_template,
        commands::templates::update_template,
        commands::templates::delete_template,
        commands::backups::create_config_backup,
        commands::files::read_text_file,
        commands::files::read_optional_text_file,
        commands::files::export_config,
        commands::files::apply_config,
        commands::files::stage_candidate,
        commands::files::remove_staged_candidate,
        commands::validation::validate_candidate
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let initialized = app
                .path()
                .app_data_dir()
                .map_err(|error| error::AppError::Startup {
                    reason: format!("cannot resolve the app data directory: {error}"),
                })
                .and_then(|data_dir| {
                    tauri::async_runtime::block_on(AppState::initialize(
                        data_dir,
                        Box::new(SystemEnvironment),
                    ))
                });
            match initialized {
                Ok(state) => {
                    app.manage(state);
                    Ok(())
                }
                Err(error) => {
                    // Never continue with a missing or partially migrated database.
                    app.dialog()
                        .message(format!("Config Forge cannot start.\n\n{error}"))
                        .title("Startup error")
                        .kind(MessageDialogKind::Error)
                        .blocking_show();
                    Err(error.into())
                }
            }
        })
        .invoke_handler(command_handler())
        .run(tauri::generate_context!())
        .expect("error while running Config Forge");
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::test::{mock_builder, mock_context, noop_assets, INVOKE_KEY};
    use tauri::webview::InvokeRequest;

    async fn ipc_state() -> (tempfile::TempDir, tauri::App<tauri::test::MockRuntime>) {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::initialize(
            dir.path().join("data"),
            Box::new(filesystem::paths::TestEnvironment::new()),
        )
        .await
        .unwrap();
        let app = mock_builder()
            .manage(state)
            .invoke_handler(command_handler())
            .build(mock_context(noop_assets()))
            .unwrap();
        (dir, app)
    }

    fn call(
        webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
        command: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, serde_json::Value> {
        tauri::test::get_ipc_response(
            webview,
            InvokeRequest {
                cmd: command.into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(body),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|response| response.deserialize().unwrap())
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn registered_commands_reach_the_database_and_filesystem() {
        let (_dir, app) = ipc_state().await;
        let app = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();

        assert_eq!(
            call(&app, "list_projects", serde_json::json!({})).unwrap(),
            serde_json::json!([])
        );
        assert_eq!(
            call(&app, "list_templates", serde_json::json!({})).unwrap(),
            serde_json::json!([])
        );
        let paths = call(&app, "get_app_paths", serde_json::json!({})).unwrap();
        assert!(paths["backupDir"].as_str().unwrap().ends_with("backups"));
        assert!(call(&app, "no_such_command", serde_json::json!({})).is_err());
    }
}
