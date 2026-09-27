use std::path::{Path, PathBuf};

use chrono::Utc;
use sha2::{Digest, Sha256};
use tokio::fs;
use tokio::io::AsyncWriteExt;

use crate::error::AppError;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    pub path: PathBuf,
    pub sha256: String,
}

fn backup_failed(path: impl AsRef<Path>, source: impl std::fmt::Display) -> AppError {
    AppError::BackupFailed {
        path: path.as_ref().display().to_string(),
        reason: source.to_string(),
    }
}

/// Copies `target` into `backup_root` as
/// `<backup_root>/YYYYMMDD-HHMMSS-<original-filename>.bak`, fsyncing the
/// copy before returning its path and SHA-256 hash. Callers building the
/// full backup layout described in the roadmap
/// (`<backup-root>/<terminal>/<project-id>/`) pass that resolved directory
/// as `backup_root`.
pub async fn create_backup(target: &Path, backup_root: &Path) -> Result<BackupRecord, AppError> {
    let bytes = fs::read(target)
        .await
        .map_err(|source| backup_failed(target, source))?;

    fs::create_dir_all(backup_root)
        .await
        .map_err(|source| backup_failed(backup_root, source))?;

    let original_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("config");
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let backup_path = backup_root.join(format!("{timestamp}-{original_name}.bak"));

    let mut backup_file = fs::File::create(&backup_path)
        .await
        .map_err(|source| backup_failed(&backup_path, source))?;
    backup_file
        .write_all(&bytes)
        .await
        .map_err(|source| backup_failed(&backup_path, source))?;
    backup_file
        .flush()
        .await
        .map_err(|source| backup_failed(&backup_path, source))?;
    backup_file
        .sync_all()
        .await
        .map_err(|source| backup_failed(&backup_path, source))?;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let sha256 = hex::encode(hasher.finalize());

    Ok(BackupRecord {
        path: backup_path,
        sha256,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn backs_up_a_file_with_a_timestamped_name_and_matching_hash() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("config");
        tokio::fs::write(&target, b"font-size = 13\n")
            .await
            .unwrap();
        let backup_root = dir.path().join("backups/ghostty/project-1");

        let record = create_backup(&target, &backup_root).await.unwrap();

        assert!(record.path.starts_with(&backup_root));
        assert!(record.path.to_string_lossy().ends_with("-config.bak"));
        let backed_up = tokio::fs::read(&record.path).await.unwrap();
        assert_eq!(backed_up, b"font-size = 13\n");

        let mut hasher = Sha256::new();
        hasher.update(b"font-size = 13\n");
        assert_eq!(record.sha256, hex::encode(hasher.finalize()));
    }

    #[tokio::test]
    async fn fails_when_the_target_does_not_exist() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("missing-config");
        let backup_root = dir.path().join("backups");

        let result = create_backup(&target, &backup_root).await;

        assert!(matches!(result, Err(AppError::BackupFailed { .. })));
    }
}
