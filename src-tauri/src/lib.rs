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
        commands::files::inspect_path,
        commands::files::read_text_file,
        commands::files::read_optional_text_file,
        commands::files::export_config,
        commands::files::apply_config,
        commands::files::stage_candidate,
        commands::files::remove_staged_candidate,
        commands::validation::validate_candidate
    ]
}

/// Coordinates desktop launches through an owner-only Unix domain socket in
/// `data_dir` so a second instance focuses the existing window and exits before
/// `AppState::initialize` (and its startup staging sweep) can run.
pub struct SingleInstanceGuard {
    socket_path: std::path::PathBuf,
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl Drop for SingleInstanceGuard {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::SeqCst);
        let _ = std::os::unix::net::UnixStream::connect(&self.socket_path);
        let _ = std::fs::remove_file(&self.socket_path);
    }
}

pub fn try_acquire_single_instance(
    data_dir: &std::path::Path,
    on_second_instance: impl Fn() + Send + Sync + 'static,
) -> Result<Option<SingleInstanceGuard>, std::io::Error> {
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;
    use std::os::unix::net::{UnixListener, UnixStream};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    std::fs::create_dir_all(data_dir)?;
    let socket_path = data_dir.join("single-instance.sock");

    if let Ok(mut stream) = UnixStream::connect(&socket_path) {
        let _ = stream.write_all(b"focus\n");
        let _ = stream.flush();
        return Ok(None);
    }

    if std::fs::symlink_metadata(&socket_path).is_ok() {
        let _ = std::fs::remove_file(&socket_path);
    }

    let listener = UnixListener::bind(&socket_path)?;
    let _ = std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o600));
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);

    std::thread::Builder::new()
        .name("config-forge-single-instance".into())
        .spawn(move || {
            for stream in listener.incoming() {
                if thread_stop.load(Ordering::SeqCst) {
                    break;
                }
                if stream.is_ok() {
                    on_second_instance();
                }
            }
        })?;

    Ok(Some(SingleInstanceGuard { socket_path, stop }))
}

fn single_instance_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("single-instance")
        .setup(|app, _api| {
            let Ok(data_dir) = app.path().app_data_dir() else {
                return Ok(());
            };
            let handle = app.clone();
            match try_acquire_single_instance(&data_dir, move || {
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }) {
                Ok(Some(guard)) => {
                    app.manage(guard);
                }
                Ok(None) => {
                    app.cleanup_before_exit();
                    std::process::exit(0);
                }
                Err(_) => {}
            }
            Ok(())
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(single_instance_plugin())
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
    use std::path::PathBuf;
    use tauri::test::{mock_builder, mock_context, noop_assets, INVOKE_KEY};
    use tauri::webview::InvokeRequest;

    async fn ipc_state() -> (tempfile::TempDir, tauri::App<tauri::test::MockRuntime>) {
        let dir = tempfile::tempdir().unwrap();
        let env = filesystem::paths::TestEnvironment::new()
            .with("HOME", dir.path().to_str().unwrap())
            .with(
                "XDG_CONFIG_HOME",
                dir.path().join(".config").to_str().unwrap(),
            );
        let state = AppState::initialize(dir.path().join("data"), Box::new(env))
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
        let (dir, app) = ipc_state().await;
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

        // Apply is restricted to detected terminal config paths.
        let ghostty_dir = dir.path().join(".config/ghostty");
        std::fs::create_dir_all(&ghostty_dir).unwrap();
        let ghostty_config = ghostty_dir.join("config");
        assert!(call(
            &app,
            "apply_config",
            serde_json::json!({
                "request": {
                    "target": dir.path().join("arbitrary.conf"),
                    "candidate": "font-size = 12\n",
                    "expectedSource": null
                }
            })
        )
        .is_err());
        assert!(call(
            &app,
            "apply_config",
            serde_json::json!({
                "request": {
                    "target": ghostty_config,
                    "candidate": "font-size = 12\n",
                    "expectedSource": null
                }
            })
        )
        .is_ok());

        // Export is restricted to the app export directory.
        let export_dir = PathBuf::from(paths["exportDir"].as_str().unwrap());
        assert!(call(
            &app,
            "export_config",
            serde_json::json!({
                "target": dir.path().join("outside-export.conf"),
                "candidate": "font-size = 12\n"
            })
        )
        .is_err());
        assert!(call(
            &app,
            "export_config",
            serde_json::json!({
                "target": export_dir.join("exported.conf"),
                "candidate": "font-size = 12\n"
            })
        )
        .is_ok());
    }

    #[test]
    fn single_instance_guard_blocks_concurrent_launch_and_recovers_after_drop() {
        use std::sync::{Arc, Condvar, Mutex};
        use std::time::Duration;

        let dir = tempfile::tempdir().unwrap();
        let data_dir = dir.path().join("data");
        let focused = Arc::new((Mutex::new(0usize), Condvar::new()));
        let focused_listener = Arc::clone(&focused);

        let guard = try_acquire_single_instance(&data_dir, move || {
            let (lock, cvar) = &*focused_listener;
            *lock.lock().unwrap() += 1;
            cvar.notify_all();
        })
        .unwrap();
        assert!(guard.is_some());

        let second = try_acquire_single_instance(&data_dir, || {}).unwrap();
        assert!(second.is_none());

        let (lock, cvar) = &*focused;
        let count = cvar
            .wait_timeout_while(lock.lock().unwrap(), Duration::from_secs(2), |count| {
                *count == 0
            })
            .unwrap()
            .0;
        assert_eq!(*count, 1);

        drop(guard);

        // A stale socket left by an ungraceful exit is replaced cleanly.
        let _ = std::os::unix::net::UnixListener::bind(data_dir.join("single-instance.sock"));
        let third = try_acquire_single_instance(&data_dir, || {}).unwrap();
        assert!(third.is_some());
    }
}
