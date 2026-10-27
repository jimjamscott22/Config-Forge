use std::path::{Path, PathBuf};

use tauri::State;

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
/// the candidate must be a file staged under the app staging root, so the
/// frontend cannot point validation at an arbitrary program or file.
pub fn check_request(
    request: &NativeValidationRequest,
    environment: &dyn Environment,
    staging_root: &Path,
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
    let staged = request.candidate_path.starts_with(staging_root)
        && !request
            .candidate_path
            .components()
            .any(|part| part == std::path::Component::ParentDir);
    if !staged {
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
    check_request(&request, state.environment.as_ref(), &state.staging_dir())?;
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
        let staging = dir.path().join("staging");

        let request = |binary: PathBuf, candidate: PathBuf| NativeValidationRequest {
            terminal: TerminalId::Kitty,
            binary_path: binary,
            candidate_path: candidate,
        };
        let staged = staging.join("id").join("kitty.conf");

        assert!(check_request(&request(kitty.clone(), staged.clone()), &env, &staging).is_ok());
        assert!(check_request(&request("/bin/sh".into(), staged), &env, &staging).is_err());
        assert!(check_request(
            &request(kitty.clone(), "/etc/passwd".into()),
            &env,
            &staging
        )
        .is_err());
        assert!(check_request(
            &request(kitty, staging.join("..").join("escape")),
            &env,
            &staging
        )
        .is_err());
    }
}
