use tauri::State;

use crate::error::AppError;
use crate::filesystem::paths::{self, Environment, TerminalId};
use crate::state::AppState;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedInstallation {
    pub terminal: TerminalId,
    pub binary_path: Option<String>,
    pub config_paths: Vec<String>,
    pub version: Option<String>,
}

pub async fn detect_all(
    environment: &dyn Environment,
) -> Result<Vec<DetectedInstallation>, AppError> {
    Ok(TerminalId::ALL
        .into_iter()
        .map(|terminal| {
            let config_paths = paths::resolve_config_paths(terminal, environment)
                .into_iter()
                .map(|candidate| candidate.path.to_string_lossy().into_owned())
                .collect();
            let binary_path = paths::find_binary(terminal.binary_name(), environment)
                .map(|path| path.to_string_lossy().into_owned());

            DetectedInstallation {
                terminal,
                binary_path,
                config_paths,
                version: None,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn detect_terminals(
    state: State<'_, AppState>,
) -> Result<Vec<DetectedInstallation>, AppError> {
    detect_all(state.environment.as_ref()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filesystem::paths::TestEnvironment;

    #[tokio::test]
    async fn detects_a_terminal_by_its_config_path_when_the_binary_is_absent() {
        let dir = tempfile::tempdir().unwrap();
        let config_dir = dir.path().join("ghostty");
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(config_dir.join("config"), "font-size = 13\n").unwrap();

        let env = TestEnvironment::new().with("XDG_CONFIG_HOME", dir.path().to_str().unwrap());

        let installations = detect_all(&env).await.unwrap();
        let ghostty = installations
            .iter()
            .find(|installation| installation.terminal == TerminalId::Ghostty)
            .unwrap();

        assert!(ghostty
            .config_paths
            .iter()
            .any(|path| path.ends_with("ghostty/config")));
        assert_eq!(ghostty.binary_path, None);
    }

    #[tokio::test]
    async fn reports_every_terminal_exactly_once() {
        let env = TestEnvironment::new();

        let installations = detect_all(&env).await.unwrap();

        assert_eq!(installations.len(), TerminalId::ALL.len());
    }
}
