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
