use std::path::PathBuf;

use tauri::State;

use crate::commands::files::is_staged_candidate;
use crate::error::AppError;
use crate::filesystem::paths::{self, Environment, TerminalId};
use crate::process::native_validation::{self, ValidationResult};
use crate::state::AppState;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeValidationRequest {
    pub terminal: TerminalId,
    pub binary_path: PathBuf,
    pub candidate_path: PathBuf,
}

/// The executable must be the terminal binary the backend itself resolves, and
/// the candidate must be a regular file staged by `stage_candidate`, so the
/// frontend cannot point validation at an arbitrary program or file.
pub fn check_request(
    request: &NativeValidationRequest,
    environment: &dyn Environment,
) -> Result<(), AppError> {
    let expected = paths::find_binary(request.terminal.binary_name(), environment);
    if expected.as_deref() != Some(request.binary_path.as_path()) {
        return Err(AppError::InvalidInput {
            reason: format!(
                "binary is not the detected {} executable",
                request.terminal.binary_name()
            ),
        });
    }
    let regular_file = std::fs::symlink_metadata(&request.candidate_path)
        .map(|metadata| metadata.file_type().is_file())
        .unwrap_or(false);
    if !is_staged_candidate(&request.candidate_path) || !regular_file {
        return Err(AppError::InvalidInput {
            reason: "candidate must be a staged file".into(),
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn validate_candidate(
    state: State<'_, AppState>,
    request: NativeValidationRequest,
) -> Result<ValidationResult, AppError> {
    check_request(&request, state.environment.as_ref())?;
    native_validation::validate_candidate(
        request.terminal,
        &request.binary_path,
        &request.candidate_path,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filesystem::paths::TestEnvironment;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn only_the_detected_binary_and_staged_candidates_are_accepted() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let kitty = bin.join("kitty");
        std::fs::write(&kitty, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&kitty, std::fs::Permissions::from_mode(0o755)).unwrap();
        let env = TestEnvironment::new().with("PATH", bin.to_str().unwrap());
        let staged = dir.path().join(".config.1234.cfgforge-validate");
        std::fs::write(&staged, "x").unwrap();
        let unstaged = dir.path().join("config");
        std::fs::write(&unstaged, "x").unwrap();
        let link = dir.path().join(".link.1234.cfgforge-validate");
        std::os::unix::fs::symlink(&unstaged, &link).unwrap();

        let request = |binary: PathBuf, candidate: PathBuf| NativeValidationRequest {
            terminal: TerminalId::Kitty,
            binary_path: binary,
            candidate_path: candidate,
        };

        assert!(check_request(&request(kitty.clone(), staged.clone()), &env).is_ok());
        assert!(check_request(&request("/bin/sh".into(), staged.clone()), &env).is_err());
        assert!(check_request(&request(kitty.clone(), unstaged), &env).is_err());
        assert!(check_request(&request(kitty.clone(), link), &env).is_err());
        assert!(check_request(
            &request(kitty, dir.path().join("..").join(".x.cfgforge-validate")),
            &env
        )
        .is_err());
    }
}
