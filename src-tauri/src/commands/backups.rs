use std::path::{Path, PathBuf};

use tauri::State;

use crate::commands::files::require_absolute;
use crate::error::AppError;
use crate::filesystem::backup::{self, BackupRecord};
use crate::state::AppState;

/// Backups may only be written below the app's own backup directory, and only
/// absolute paths are accepted for the file being copied.
pub fn check_paths(target: &Path, backup_root: &Path, backup_dir: &Path) -> Result<(), AppError> {
    require_absolute(target)?;
    require_absolute(backup_root)?;
    if !backup_root.starts_with(backup_dir) {
        return Err(AppError::InvalidInput {
            reason: "backups must be stored in the app backup directory".into(),
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn create_config_backup(
    state: State<'_, AppState>,
    target: PathBuf,
    backup_root: PathBuf,
) -> Result<BackupRecord, AppError> {
    check_paths(&target, &backup_root, &state.backup_dir)?;
    backup::create_backup(&target, &backup_root).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backups_stay_inside_the_backup_directory() {
        let dir = Path::new("/data/backups");
        let target = Path::new("/home/me/.config/kitty/kitty.conf");
        assert!(check_paths(target, Path::new("/data/backups/kitty/p1"), dir).is_ok());
        assert!(check_paths(target, Path::new("/tmp/elsewhere"), dir).is_err());
        assert!(check_paths(target, Path::new("relative"), dir).is_err());
        assert!(check_paths(Path::new("config"), Path::new("/data/backups/x"), dir).is_err());
        assert!(check_paths(target, Path::new("/data/backups/../escape"), dir).is_err());
    }
}
