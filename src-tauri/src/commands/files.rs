use std::path::{Component, Path, PathBuf};

use tauri::State;

use crate::error::AppError;
use crate::filesystem::atomic_write::{self, WriteReceipt};
use crate::filesystem::paths::TerminalId;
use crate::state::AppState;

fn invalid(reason: impl Into<String>) -> AppError {
    AppError::InvalidInput {
        reason: reason.into(),
    }
}

fn file_access(path: &Path, source: impl std::fmt::Display) -> AppError {
    AppError::FileAccess {
        path: path.display().to_string(),
        reason: source.to_string(),
    }
}

/// Frontend-supplied destinations must be explicit absolute paths so a write
/// can never resolve against the app's working directory.
fn require_absolute(path: &Path) -> Result<(), AppError> {
    if !path.is_absolute() {
        return Err(invalid(format!(
            "path must be absolute: {}",
            path.display()
        )));
    }
    if path.components().any(|part| part == Component::ParentDir) {
        return Err(invalid(format!(
            "path must not contain '..': {}",
            path.display()
        )));
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub data_dir: PathBuf,
    pub backup_dir: PathBuf,
    pub export_dir: PathBuf,
}

#[tauri::command]
pub fn get_app_paths(state: State<'_, AppState>) -> AppPaths {
    AppPaths {
        data_dir: state.data_dir.clone(),
        backup_dir: state.backup_dir.clone(),
        export_dir: state.export_dir.clone(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathInfo {
    pub exists: bool,
    pub is_symlink: bool,
}

/// Looks at the path itself (not its target) so a symlinked config is visible
/// before the user reviews a write the backend would refuse.
pub async fn inspect(path: &Path) -> Result<PathInfo, AppError> {
    require_absolute(path)?;
    match tokio::fs::symlink_metadata(path).await {
        Ok(metadata) => Ok(PathInfo {
            exists: true,
            is_symlink: metadata.file_type().is_symlink(),
        }),
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => Ok(PathInfo {
            exists: false,
            is_symlink: false,
        }),
        Err(source) => Err(file_access(path, source)),
    }
}

pub async fn read_text(path: &Path) -> Result<String, AppError> {
    require_absolute(path)?;
    tokio::fs::read_to_string(path)
        .await
        .map_err(|source| file_access(path, source))
}

/// `None` means the file does not exist, which is how a brand-new destination
/// is told apart from an unreadable one.
pub async fn read_optional_text(path: &Path) -> Result<Option<String>, AppError> {
    require_absolute(path)?;
    match tokio::fs::read_to_string(path).await {
        Ok(text) => Ok(Some(text)),
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(file_access(path, source)),
    }
}

/// Exports never replace an existing file; overwriting a live config is what
/// Apply (with its review, snapshot, and backup) is for.
pub async fn export_text(target: &Path, candidate: &str) -> Result<WriteReceipt, AppError> {
    require_absolute(target)?;
    atomic_write::atomic_replace_if_unchanged(target, candidate.as_bytes(), None).await
}

pub async fn apply_text(
    target: &Path,
    candidate: &str,
    expected_source: Option<&str>,
) -> Result<WriteReceipt, AppError> {
    require_absolute(target)?;
    atomic_write::atomic_replace_if_unchanged(
        target,
        candidate.as_bytes(),
        expected_source.map(str::as_bytes),
    )
    .await
}

/// Writes the candidate into a private directory under the app staging root so
/// native validation reads a file the app created, never a user path.
pub async fn stage_text(
    staging_root: &Path,
    candidate: &str,
    terminal: TerminalId,
) -> Result<PathBuf, AppError> {
    let directory = staging_root.join(uuid::Uuid::new_v4().to_string());
    tokio::fs::create_dir_all(&directory)
        .await
        .map_err(|source| file_access(&directory, source))?;
    let name = match terminal {
        TerminalId::Alacritty => "alacritty.toml",
        TerminalId::Ghostty => "ghostty.conf",
        TerminalId::Kitty => "kitty.conf",
    };
    let path = directory.join(name);
    if let Err(source) = tokio::fs::write(&path, candidate).await {
        let _ = tokio::fs::remove_dir_all(&directory).await;
        return Err(file_access(&path, source));
    }
    Ok(path)
}

/// Only removes a staged directory created by `stage_text` under the staging root.
pub async fn remove_staged(staging_root: &Path, staged: &Path) -> Result<(), AppError> {
    require_absolute(staged)?;
    let directory = staged
        .parent()
        .filter(|directory| directory.parent() == Some(staging_root))
        .ok_or_else(|| invalid("path is not a staged candidate"))?;
    match tokio::fs::remove_dir_all(directory).await {
        Ok(()) => Ok(()),
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(file_access(directory, source)),
    }
}

#[tauri::command]
pub async fn inspect_path(path: PathBuf) -> Result<PathInfo, AppError> {
    inspect(&path).await
}

#[tauri::command]
pub async fn read_text_file(path: PathBuf) -> Result<String, AppError> {
    read_text(&path).await
}

#[tauri::command]
pub async fn read_optional_text_file(path: PathBuf) -> Result<Option<String>, AppError> {
    read_optional_text(&path).await
}

#[tauri::command]
pub async fn export_config(target: PathBuf, candidate: String) -> Result<WriteReceipt, AppError> {
    export_text(&target, &candidate).await
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyConfigRequest {
    pub target: PathBuf,
    pub candidate: String,
    pub expected_source: Option<String>,
}

#[tauri::command]
pub async fn apply_config(request: ApplyConfigRequest) -> Result<WriteReceipt, AppError> {
    apply_text(
        &request.target,
        &request.candidate,
        request.expected_source.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn stage_candidate(
    state: State<'_, AppState>,
    candidate: String,
    terminal: TerminalId,
) -> Result<PathBuf, AppError> {
    stage_text(&state.staging_dir(), &candidate, terminal).await
}

#[tauri::command]
pub async fn remove_staged_candidate(
    state: State<'_, AppState>,
    path: PathBuf,
) -> Result<(), AppError> {
    remove_staged(&state.staging_dir(), &path).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn relative_and_parent_paths_are_rejected() {
        assert!(read_text(Path::new("config")).await.is_err());
        assert!(export_text(Path::new("config"), "x").await.is_err());
        assert!(apply_text(Path::new("/tmp/../etc/x"), "x", None)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn inspect_reports_missing_regular_and_symlinked_paths() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("config");
        assert_eq!(
            inspect(&file).await.unwrap(),
            PathInfo {
                exists: false,
                is_symlink: false
            }
        );
        std::fs::write(&file, "x").unwrap();
        let link = dir.path().join("link");
        std::os::unix::fs::symlink(&file, &link).unwrap();
        assert!(!inspect(&file).await.unwrap().is_symlink);
        assert_eq!(
            inspect(&link).await.unwrap(),
            PathInfo {
                exists: true,
                is_symlink: true
            }
        );
    }

    #[tokio::test]
    async fn optional_reads_distinguish_missing_from_present() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("config");
        assert_eq!(read_optional_text(&file).await.unwrap(), None);
        std::fs::write(&file, "font-size = 12\n").unwrap();
        assert_eq!(
            read_optional_text(&file).await.unwrap().as_deref(),
            Some("font-size = 12\n")
        );
        assert!(read_text(&dir.path().join("missing")).await.is_err());
    }

    #[tokio::test]
    async fn export_creates_new_files_but_never_replaces_existing_ones() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("exported.conf");
        let receipt = export_text(&target, "a = 1\n").await.unwrap();
        assert_eq!(receipt.bytes_written, 6);
        assert!(export_text(&target, "a = 2\n").await.is_err());
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "a = 1\n");
    }

    #[tokio::test]
    async fn staged_candidates_are_private_and_removable_only_from_staging() {
        let root = tempfile::tempdir().unwrap();
        let staging = root.path().join("staging");
        std::fs::create_dir_all(&staging).unwrap();

        let staged = stage_text(&staging, "[font]\n", TerminalId::Alacritty)
            .await
            .unwrap();
        assert!(staged.starts_with(&staging));
        assert!(staged.ends_with("alacritty.toml"));
        assert_eq!(std::fs::read_to_string(&staged).unwrap(), "[font]\n");

        let outside = root.path().join("keep.conf");
        std::fs::write(&outside, "keep").unwrap();
        assert!(remove_staged(&staging, &outside).await.is_err());
        assert!(outside.exists());

        remove_staged(&staging, &staged).await.unwrap();
        assert!(!staged.exists());
        remove_staged(&staging, &staged).await.unwrap();
    }
}
