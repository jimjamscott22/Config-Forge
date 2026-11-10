use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime};

use tauri::State;
use tokio::io::AsyncWriteExt;

use crate::error::AppError;
use crate::filesystem::atomic_write::{self, WriteReceipt};
use crate::filesystem::paths::{self, Environment};
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
pub fn require_absolute(path: &Path) -> Result<(), AppError> {
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

/// Apply targets and staged validation files must match one of the terminal
/// configuration paths resolved from the environment.
pub fn check_apply_target(target: &Path, environment: &dyn Environment) -> Result<(), AppError> {
    require_absolute(target)?;
    let allowed = paths::all_candidate_config_paths(environment);
    if !allowed.iter().any(|candidate| candidate == target) {
        return Err(invalid(format!(
            "apply target must be a detected terminal config path: {}",
            target.display()
        )));
    }
    Ok(())
}

/// Exports may only be written as new files inside the app's export directory.
pub fn check_export_target(target: &Path, export_dir: &Path) -> Result<(), AppError> {
    require_absolute(target)?;
    require_absolute(export_dir)?;
    if !target.starts_with(export_dir) || target == export_dir {
        return Err(invalid(
            "exports must be stored in the app export directory",
        ));
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

/// Suffix of the hidden sibling file native validation reads. It sits next to
/// the destination (not in an app directory) so relative `include`/`config-file`
/// entries resolve exactly as they will after the real write.
const STAGED_SUFFIX: &str = ".cfgforge-validate";

/// Maximum age for an active validation staging file. Native validation enforces
/// a 5-second timeout and removes its staging file in a `finally` block before
/// user confirmation, so anything older than 60 seconds is provably stale even
/// if its owning PID was later recycled or omitted.
pub const STALE_STAGED_AGE: Duration = Duration::from_secs(60);

/// True only for names `stage_text` produces: absolute, no `..`, hidden, and
/// ending in the staging suffix. Used to bound what may be validated or removed.
pub fn is_staged_candidate(path: &Path) -> bool {
    path.is_absolute()
        && !path.components().any(|part| part == Component::ParentDir)
        && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| {
                name.starts_with('.')
                    && name.ends_with(STAGED_SUFFIX)
                    && name.len() > STAGED_SUFFIX.len() + 1
            })
}

/// Extracts the `pid-<u32>` owner tag embedded by `stage_text`, if present.
fn staged_owner_pid(path: &Path) -> Option<u32> {
    let name = path.file_name()?.to_str()?;
    let stem = name.strip_suffix(STAGED_SUFFIX)?;
    let (before_uuid, _uuid) = stem.rsplit_once('.')?;
    let (_prefix, pid_segment) = before_uuid.rsplit_once('.')?;
    pid_segment.strip_prefix("pid-")?.parse::<u32>().ok()
}

fn process_is_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    if pid == std::process::id() {
        return true;
    }
    #[cfg(target_os = "linux")]
    {
        let proc_root = Path::new("/proc");
        if !proc_root.is_dir() {
            return true;
        }
        let proc_dir = proc_root.join(pid.to_string());
        if !proc_dir.exists() {
            return false;
        }
        if let Ok(stat) = std::fs::read_to_string(proc_dir.join("stat")) {
            if let Some((_, rest)) = stat.rsplit_once(')') {
                if let Some(state) = rest.split_whitespace().next() {
                    return !matches!(state, "Z" | "X" | "x");
                }
            }
        }
        true
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

/// A staged candidate is safe to sweep when either:
/// 1. Its modification time is at least `STALE_STAGED_AGE` behind `now` (well
///    past the 5-second native validator timeout), or
/// 2. Its filename records an owning `pid-<u32>` whose process is no longer
///    running.
///
/// Fresh candidates whose owner process is still alive (or whose filename has
/// no PID tag) are treated as active and left alone.
fn is_abandoned_staged_candidate(
    path: &Path,
    metadata: &std::fs::Metadata,
    now: SystemTime,
) -> bool {
    let is_stale = metadata
        .modified()
        .ok()
        .and_then(|modified| now.duration_since(modified).ok())
        .is_some_and(|age| age >= STALE_STAGED_AGE);
    if is_stale {
        return true;
    }
    match staged_owner_pid(path) {
        Some(pid) => !process_is_alive(pid),
        None => false,
    }
}

/// Removes abandoned `.cfgforge-validate` regular files in `dirs` without
/// touching active validation files, symlinks, directories, or any other files.
/// Missing or unreadable directories are skipped so startup never fails on an
/// absent config folder.
pub fn sweep_staged_candidates(dirs: impl IntoIterator<Item = PathBuf>) -> usize {
    sweep_staged_candidates_at(dirs, SystemTime::now())
}

pub fn sweep_staged_candidates_at(
    dirs: impl IntoIterator<Item = PathBuf>,
    now: SystemTime,
) -> usize {
    let mut seen = HashSet::new();
    let mut removed = 0;
    for dir in dirs {
        if require_absolute(&dir).is_err() || !seen.insert(dir.clone()) {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !is_staged_candidate(&path) {
                continue;
            }
            let Ok(metadata) = std::fs::symlink_metadata(&path) else {
                continue;
            };
            if !metadata.file_type().is_file() {
                continue;
            }
            if !is_abandoned_staged_candidate(&path, &metadata, now) {
                continue;
            }
            if std::fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }
    }
    removed
}

/// Sweeps the parent directories of all detected terminal config paths plus any
/// additional app directories for leftover staged validation files.
pub fn sweep_environment_staged_candidates(
    environment: &dyn Environment,
    extra_dirs: impl IntoIterator<Item = PathBuf>,
) -> usize {
    let candidate_parents = paths::all_candidate_config_paths(environment)
        .into_iter()
        .filter_map(|path| path.parent().map(Path::to_path_buf));
    sweep_staged_candidates(candidate_parents.chain(extra_dirs))
}

/// Writes the candidate to a new, owner-only hidden file beside `target`.
pub async fn stage_text(target: &Path, candidate: &str) -> Result<PathBuf, AppError> {
    require_absolute(target)?;
    let parent = target
        .parent()
        .ok_or_else(|| invalid("destination has no parent directory"))?;
    let name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("config");
    let pid = std::process::id();
    let path = parent.join(format!(
        ".{name}.pid-{pid}.{}{STAGED_SUFFIX}",
        uuid::Uuid::new_v4()
    ));
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&path)
        .await
        .map_err(|source| file_access(&path, source))?;
    // tokio files buffer writes; flush before the validator reads the file.
    let written = async {
        file.write_all(candidate.as_bytes()).await?;
        file.flush().await
    }
    .await;
    drop(file);
    if let Err(source) = written {
        let _ = tokio::fs::remove_file(&path).await;
        return Err(file_access(&path, source));
    }
    Ok(path)
}

/// Only removes files that `stage_text` could have created.
pub async fn remove_staged(staged: &Path) -> Result<(), AppError> {
    if !is_staged_candidate(staged) {
        return Err(invalid("path is not a staged candidate"));
    }
    match tokio::fs::remove_file(staged).await {
        Ok(()) => Ok(()),
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(file_access(staged, source)),
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
pub async fn export_config(
    state: State<'_, AppState>,
    target: PathBuf,
    candidate: String,
) -> Result<WriteReceipt, AppError> {
    check_export_target(&target, &state.export_dir)?;
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
pub async fn apply_config(
    state: State<'_, AppState>,
    request: ApplyConfigRequest,
) -> Result<WriteReceipt, AppError> {
    check_apply_target(&request.target, state.environment.as_ref())?;
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
    destination: PathBuf,
) -> Result<PathBuf, AppError> {
    check_apply_target(&destination, state.environment.as_ref())?;
    stage_text(&destination, &candidate).await
}

#[tauri::command]
pub async fn remove_staged_candidate(path: PathBuf) -> Result<(), AppError> {
    remove_staged(&path).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

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
    async fn staged_candidates_sit_beside_the_destination_and_are_removable_only_if_staged() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("config");

        let staged = stage_text(&target, "font-size = 12\n").await.unwrap();
        assert_eq!(staged.parent(), Some(dir.path()));
        assert!(is_staged_candidate(&staged));
        assert_eq!(
            std::fs::read_to_string(&staged).unwrap(),
            "font-size = 12\n"
        );
        let mode = std::fs::metadata(&staged).unwrap().permissions().mode();
        assert_eq!(mode & 0o077, 0);
        assert!(!target.exists());

        let other = dir.path().join("keep.conf");
        std::fs::write(&other, "keep").unwrap();
        assert!(remove_staged(&other).await.is_err());
        assert!(other.exists());

        remove_staged(&staged).await.unwrap();
        assert!(!staged.exists());
        remove_staged(&staged).await.unwrap();
    }

    #[tokio::test]
    async fn staging_fails_when_the_destination_directory_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("missing").join("config");
        assert!(stage_text(&target, "x").await.is_err());
        assert!(stage_text(Path::new("relative"), "x").await.is_err());
    }

    #[test]
    fn apply_targets_must_match_detected_terminal_config_paths() {
        let env = paths::TestEnvironment::new()
            .with("HOME", "/home/me")
            .with("XDG_CONFIG_HOME", "/home/me/.config");

        assert!(check_apply_target(Path::new("/home/me/.config/ghostty/config"), &env).is_ok());
        assert!(check_apply_target(Path::new("/home/me/.config/kitty/kitty.conf"), &env).is_ok());
        assert!(
            check_apply_target(Path::new("/home/me/.config/alacritty/alacritty.toml"), &env)
                .is_ok()
        );
        assert!(check_apply_target(Path::new("/home/me/.alacritty.toml"), &env).is_ok());

        assert!(check_apply_target(Path::new("/home/me/.bashrc"), &env).is_err());
        assert!(check_apply_target(Path::new("/tmp/config"), &env).is_err());
        assert!(check_apply_target(Path::new("relative/config"), &env).is_err());
        assert!(check_apply_target(
            Path::new("/home/me/.config/../.config/ghostty/config"),
            &env
        )
        .is_err());
    }

    #[test]
    fn export_targets_must_stay_inside_the_export_directory() {
        let export_dir = Path::new("/data/exports");

        assert!(check_export_target(Path::new("/data/exports/ghostty.conf"), export_dir).is_ok());
        assert!(check_export_target(export_dir, export_dir).is_err());
        assert!(check_export_target(Path::new("/tmp/ghostty.conf"), export_dir).is_err());
        assert!(
            check_export_target(Path::new("/data/exports/../escape.conf"), export_dir).is_err()
        );
        assert!(check_export_target(Path::new("relative.conf"), export_dir).is_err());
    }

    fn backdate_past_stale_threshold(path: &Path) {
        let stale_mtime = SystemTime::now() - STALE_STAGED_AGE - Duration::from_secs(5);
        std::fs::File::options()
            .write(true)
            .open(path)
            .unwrap()
            .set_modified(stale_mtime)
            .unwrap();
    }

    #[tokio::test]
    async fn startup_sweep_removes_only_regular_staged_candidates() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("config");
        std::fs::write(&config, "font-size = 13\n").unwrap();

        let staged = stage_text(&config, "font-size = 14\n").await.unwrap();
        backdate_past_stale_threshold(&staged);
        let dotfile = dir.path().join(".bashrc");
        std::fs::write(&dotfile, "export PATH").unwrap();
        let atomic_tmp = dir.path().join(".config.123.cfgforge-tmp");
        std::fs::write(&atomic_tmp, "partial").unwrap();
        let unhidden = dir.path().join("config.123.cfgforge-validate");
        std::fs::write(&unhidden, "not hidden").unwrap();
        let bare_suffix = dir.path().join(".cfgforge-validate");
        std::fs::write(&bare_suffix, "bare").unwrap();
        let symlink = dir.path().join(".symlink.123.cfgforge-validate");
        std::os::unix::fs::symlink(&config, &symlink).unwrap();
        let subdir = dir.path().join(".dir.123.cfgforge-validate");
        std::fs::create_dir(&subdir).unwrap();

        let removed =
            sweep_staged_candidates([dir.path().to_path_buf(), dir.path().join("missing-dir")]);

        assert_eq!(removed, 1);
        assert!(!staged.exists());
        assert!(config.exists());
        assert!(dotfile.exists());
        assert!(atomic_tmp.exists());
        assert!(unhidden.exists());
        assert!(bare_suffix.exists());
        assert!(symlink.symlink_metadata().is_ok());
        assert!(subdir.is_dir());
    }

    #[tokio::test]
    async fn freshly_staged_active_candidate_survives_sweep_while_stale_and_abandoned_are_removed()
    {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("kitty.conf");
        std::fs::write(&config, "font_size 12\n").unwrap();

        let active = stage_text(&config, "font_size 13\n").await.unwrap();
        assert_eq!(staged_owner_pid(&active), Some(std::process::id()));

        let stale = stage_text(&config, "font_size 14\n").await.unwrap();
        backdate_past_stale_threshold(&stale);

        let mut exited_child = std::process::Command::new("true").spawn().unwrap();
        let exited_pid = exited_child.id();
        exited_child.wait().unwrap();
        let dead_pid = dir.path().join(format!(
            ".kitty.conf.pid-{exited_pid}.{}{STAGED_SUFFIX}",
            uuid::Uuid::new_v4()
        ));
        std::fs::write(&dead_pid, "font_size 15\n").unwrap();

        let fresh_untagged = dir.path().join(".kitty.conf.legacy-id.cfgforge-validate");
        std::fs::write(&fresh_untagged, "font_size 16\n").unwrap();

        let removed = sweep_staged_candidates([dir.path().to_path_buf()]);

        assert_eq!(removed, 2);
        assert!(active.exists());
        assert!(fresh_untagged.exists());
        assert!(!stale.exists());
        assert!(!dead_pid.exists());

        // Once the age threshold passes, untagged or leaked files are swept too.
        let future = SystemTime::now() + STALE_STAGED_AGE + Duration::from_secs(1);
        let removed_later = sweep_staged_candidates_at([dir.path().to_path_buf()], future);
        assert_eq!(removed_later, 2);
        assert!(!active.exists());
        assert!(!fresh_untagged.exists());
    }
}
