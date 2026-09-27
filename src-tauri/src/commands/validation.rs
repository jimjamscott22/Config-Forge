use std::path::PathBuf;

use crate::error::AppError;
use crate::filesystem::paths::TerminalId;
use crate::process::native_validation::{self, ValidationResult};

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeValidationRequest {
    pub terminal: TerminalId,
    pub binary_path: PathBuf,
    pub candidate_path: PathBuf,
}

#[tauri::command]
pub async fn validate_candidate(
    request: NativeValidationRequest,
) -> Result<ValidationResult, AppError> {
    native_validation::validate_candidate(
        request.terminal,
        &request.binary_path,
        &request.candidate_path,
    )
    .await
}
