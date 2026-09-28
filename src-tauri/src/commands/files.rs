use std::path::PathBuf;

use crate::error::AppError;
use crate::filesystem::atomic_write::{self, WriteReceipt};

#[tauri::command]
pub async fn write_file_atomically(
    target: PathBuf,
    candidate: String,
) -> Result<WriteReceipt, AppError> {
    atomic_write::atomic_replace(&target, candidate.as_bytes()).await
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyConfigRequest {
    pub target: PathBuf,
    pub candidate: String,
    pub expected_source: Option<String>,
}

// Registration and desktop startup wiring are scheduled for Task 17.
#[tauri::command]
pub async fn apply_config(request: ApplyConfigRequest) -> Result<WriteReceipt, AppError> {
    atomic_write::atomic_replace_if_unchanged(
        &request.target,
        request.candidate.as_bytes(),
        request.expected_source.as_deref().map(str::as_bytes),
    )
    .await
}
