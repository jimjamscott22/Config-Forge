use std::path::PathBuf;

use crate::error::AppError;
use crate::filesystem::backup::{self, BackupRecord};

#[tauri::command]
pub async fn create_config_backup(
    target: PathBuf,
    backup_root: PathBuf,
) -> Result<BackupRecord, AppError> {
    backup::create_backup(&target, &backup_root).await
}
