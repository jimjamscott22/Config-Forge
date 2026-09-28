use std::path::Path;

use sha2::{Digest, Sha256};
use tokio::fs;
use tokio::io::AsyncWriteExt;

use crate::error::AppError;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteReceipt {
    pub bytes_written: u64,
    pub sha256: String,
}

/// Test-only interception points for the atomic write pipeline.
#[derive(Default)]
pub struct AtomicWriteHooks {
    fail_before_rename: bool,
}

impl AtomicWriteHooks {
    pub fn fail_before_rename() -> Self {
        Self {
            fail_before_rename: true,
        }
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn write_failed(target: &Path, source: impl std::fmt::Display) -> AppError {
    AppError::AtomicWriteFailed {
        path: target.display().to_string(),
        reason: source.to_string(),
    }
}

pub async fn atomic_replace(target: &Path, candidate: &[u8]) -> Result<WriteReceipt, AppError> {
    atomic_replace_with_hooks(target, candidate, AtomicWriteHooks::default()).await
}

/// Replaces `target` with `candidate` without ever leaving it in a
/// half-written state: the candidate is written to a sibling temporary
/// file, fsynced, and renamed over the target, then read back and hashed
/// to prove the write landed correctly.
pub async fn atomic_replace_with_hooks(
    target: &Path,
    candidate: &[u8],
    hooks: AtomicWriteHooks,
) -> Result<WriteReceipt, AppError> {
    atomic_replace_checked(target, candidate, hooks, None).await
}

/// Reject stale confirmations rather than overwrite a destination changed outside the app.
/// `None` means the confirmed destination did not exist.
pub async fn atomic_replace_if_unchanged(
    target: &Path,
    candidate: &[u8],
    expected: Option<&[u8]>,
) -> Result<WriteReceipt, AppError> {
    atomic_replace_checked(
        target,
        candidate,
        AtomicWriteHooks::default(),
        Some(expected),
    )
    .await
}

async fn atomic_replace_checked(
    target: &Path,
    candidate: &[u8],
    hooks: AtomicWriteHooks,
    expected: Option<Option<&[u8]>>,
) -> Result<WriteReceipt, AppError> {
    let parent = target
        .parent()
        .ok_or_else(|| write_failed(target, "target has no parent directory"))?;

    if !fs::try_exists(parent).await.unwrap_or(false) {
        return Err(write_failed(target, "parent directory does not exist"));
    }

    if let Ok(metadata) = fs::symlink_metadata(target).await {
        if metadata.file_type().is_symlink() {
            return Err(AppError::TargetIsSymlink {
                path: target.display().to_string(),
            });
        }
    }

    let existing_permissions = fs::metadata(target).await.ok().map(|m| m.permissions());

    let temp_file_name = format!(
        ".{}.{}.cfgforge-tmp",
        target
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("config"),
        uuid::Uuid::new_v4()
    );
    let temp_path = parent.join(temp_file_name);

    let mut temp_file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .await
        .map_err(|source| write_failed(target, source))?;

    if let Some(permissions) = existing_permissions {
        let _ = fs::set_permissions(&temp_path, permissions).await;
    }

    temp_file
        .write_all(candidate)
        .await
        .map_err(|source| write_failed(target, source))?;

    if hooks.fail_before_rename {
        drop(temp_file);
        let _ = fs::remove_file(&temp_path).await;
        return Err(write_failed(target, "write aborted before rename"));
    }

    temp_file
        .flush()
        .await
        .map_err(|source| write_failed(target, source))?;
    temp_file
        .sync_all()
        .await
        .map_err(|source| write_failed(target, source))?;
    drop(temp_file);

    if let Some(expected) = expected {
        let actual = match fs::read(target).await {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => {
                let _ = fs::remove_file(&temp_path).await;
                return Err(write_failed(target, error));
            }
        };
        if actual.as_deref() != expected {
            let _ = fs::remove_file(&temp_path).await;
            return Err(write_failed(
                target,
                "destination changed since confirmation",
            ));
        }
    }

    fs::rename(&temp_path, target)
        .await
        .map_err(|source| write_failed(target, source))?;

    let written = fs::read(target)
        .await
        .map_err(|source| write_failed(target, source))?;

    let candidate_hash = sha256_hex(candidate);
    let actual_hash = sha256_hex(&written);

    if actual_hash != candidate_hash {
        return Err(AppError::ReadbackMismatch {
            path: target.display().to_string(),
        });
    }

    Ok(WriteReceipt {
        bytes_written: written.len() as u64,
        sha256: actual_hash,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_changed_or_newly_created_destinations() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("config");
        fs::write(&target, b"external edit").await.unwrap();
        assert!(
            atomic_replace_if_unchanged(&target, b"candidate", Some(b"confirmed"))
                .await
                .is_err()
        );
        assert!(atomic_replace_if_unchanged(&target, b"candidate", None)
            .await
            .is_err());
        assert_eq!(fs::read(&target).await.unwrap(), b"external edit");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
        atomic_replace_if_unchanged(&target, b"candidate", Some(b"external edit"))
            .await
            .unwrap();
        assert_eq!(fs::read(&target).await.unwrap(), b"candidate");
        let new_target = dir.path().join("new-config");
        atomic_replace_if_unchanged(&new_target, b"new", None)
            .await
            .unwrap();
        assert_eq!(fs::read(&new_target).await.unwrap(), b"new");
    }

    #[tokio::test]
    async fn failed_write_leaves_original_file_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("config");
        tokio::fs::write(&target, b"original").await.unwrap();

        let result = atomic_replace_with_hooks(
            &target,
            b"candidate",
            AtomicWriteHooks::fail_before_rename(),
        )
        .await;

        assert!(result.is_err());
        assert_eq!(
            tokio::fs::read_to_string(&target).await.unwrap(),
            "original"
        );
    }

    #[tokio::test]
    async fn successful_write_creates_a_matching_readback_hash() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("config");
        tokio::fs::write(&target, b"original").await.unwrap();

        let receipt = atomic_replace(&target, b"candidate").await.unwrap();

        assert_eq!(
            tokio::fs::read_to_string(&target).await.unwrap(),
            "candidate"
        );
        assert_eq!(receipt.bytes_written, 9);
    }

    #[tokio::test]
    async fn refuses_to_write_through_a_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let real_file = dir.path().join("real-config");
        tokio::fs::write(&real_file, b"original").await.unwrap();
        let target = dir.path().join("config");
        std::os::unix::fs::symlink(&real_file, &target).unwrap();

        let result = atomic_replace(&target, b"candidate").await;

        assert!(matches!(result, Err(AppError::TargetIsSymlink { .. })));
        assert_eq!(
            tokio::fs::read_to_string(&real_file).await.unwrap(),
            "original"
        );
    }

    #[tokio::test]
    async fn rejects_a_target_with_a_missing_parent_directory() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("missing-parent").join("config");

        let result = atomic_replace(&target, b"candidate").await;

        assert!(matches!(result, Err(AppError::AtomicWriteFailed { .. })));
    }

    #[tokio::test]
    async fn creates_a_new_file_when_the_target_does_not_yet_exist() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("config");

        let receipt = atomic_replace(&target, b"candidate").await.unwrap();

        assert_eq!(
            tokio::fs::read_to_string(&target).await.unwrap(),
            "candidate"
        );
        assert_eq!(receipt.bytes_written, 9);
    }
}
