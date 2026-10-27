//! End-to-end safety checks for the apply pipeline on a real filesystem:
//! backup → checked atomic replace → read-back, with failure injection.

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use config_forge_lib::commands::files::{
    apply_text, export_text, inspect, remove_staged, stage_text,
};
use config_forge_lib::error::AppError;
use config_forge_lib::filesystem::atomic_write::{atomic_replace_with_hooks, AtomicWriteHooks};
use config_forge_lib::filesystem::backup::create_backup;
use config_forge_lib::filesystem::paths::TerminalId;
use config_forge_lib::process::native_validation::validate_candidate;
use sha2::{Digest, Sha256};

fn sha256(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn names(dir: &Path) -> Vec<String> {
    let mut found: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    found.sort();
    found
}

#[tokio::test]
async fn backup_exists_before_replacement_and_readback_hash_matches() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("config");
    let backups = dir.path().join("backups/ghostty/project");
    std::fs::write(&target, "# my comment\nfont-size = 9\n").unwrap();
    let candidate = "# my comment\nfont-size = 14\n";

    let backup = create_backup(&target, &backups).await.unwrap();
    // The original is safe on disk before anything is replaced.
    assert_eq!(
        std::fs::read_to_string(&backup.path).unwrap(),
        "# my comment\nfont-size = 9\n"
    );
    assert_eq!(
        std::fs::read_to_string(&target).unwrap(),
        "# my comment\nfont-size = 9\n"
    );

    let receipt = apply_text(&target, candidate, Some("# my comment\nfont-size = 9\n"))
        .await
        .unwrap();

    let written = std::fs::read(&target).unwrap();
    assert_eq!(written, candidate.as_bytes());
    assert_eq!(receipt.sha256, sha256(candidate.as_bytes()));
    assert_eq!(receipt.sha256, sha256(&written));
    assert_eq!(receipt.bytes_written, candidate.len() as u64);
    // Only the config itself remains next to it: no temporary files are left behind.
    assert_eq!(names(dir.path()), vec!["backups", "config"]);
}

#[tokio::test]
async fn injected_failure_keeps_the_original_and_leaves_no_temporary_files() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("config");
    std::fs::write(&target, "original").unwrap();

    let result = atomic_replace_with_hooks(
        &target,
        b"candidate",
        AtomicWriteHooks::fail_before_rename(),
    )
    .await;

    assert!(matches!(result, Err(AppError::AtomicWriteFailed { .. })));
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "original");
    assert_eq!(names(dir.path()), vec!["config"]);
}

#[tokio::test]
async fn a_destination_changed_after_confirmation_is_not_overwritten() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("config");
    std::fs::write(&target, "edited elsewhere").unwrap();

    let stale = apply_text(&target, "candidate", Some("what the user reviewed")).await;
    assert!(matches!(stale, Err(AppError::AtomicWriteFailed { .. })));
    assert_eq!(
        std::fs::read_to_string(&target).unwrap(),
        "edited elsewhere"
    );

    // A destination reviewed as "new" must not appear later and be clobbered.
    let created_meanwhile = apply_text(&target, "candidate", None).await;
    assert!(created_meanwhile.is_err());
    assert_eq!(
        std::fs::read_to_string(&target).unwrap(),
        "edited elsewhere"
    );
    assert_eq!(names(dir.path()), vec!["config"]);
}

#[tokio::test]
async fn new_destinations_need_no_backup_and_are_created() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("fresh.conf");

    assert!(!inspect(&target).await.unwrap().exists);
    let receipt = apply_text(&target, "font-size = 12\n", None).await.unwrap();

    assert_eq!(
        std::fs::read_to_string(&target).unwrap(),
        "font-size = 12\n"
    );
    assert_eq!(receipt.sha256, sha256(b"font-size = 12\n"));
    // Backing up a file that does not exist is an error the caller must skip.
    assert!(matches!(
        create_backup(&dir.path().join("missing"), &dir.path().join("b")).await,
        Err(AppError::BackupFailed { .. })
    ));
}

#[tokio::test]
async fn symlinked_destinations_are_flagged_and_never_written_through() {
    let dir = tempfile::tempdir().unwrap();
    let real = dir.path().join("dotfiles-config");
    std::fs::write(&real, "managed by dotfiles").unwrap();
    let link = dir.path().join("config");
    std::os::unix::fs::symlink(&real, &link).unwrap();

    assert!(inspect(&link).await.unwrap().is_symlink);
    let result = apply_text(&link, "candidate", Some("managed by dotfiles")).await;

    assert!(matches!(result, Err(AppError::TargetIsSymlink { .. })));
    assert_eq!(
        std::fs::read_to_string(&real).unwrap(),
        "managed by dotfiles"
    );
    assert!(std::fs::symlink_metadata(&link)
        .unwrap()
        .file_type()
        .is_symlink());
}

#[tokio::test]
async fn exports_never_replace_existing_files() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("exported.conf");
    export_text(&target, "first").await.unwrap();
    assert!(export_text(&target, "second").await.is_err());
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "first");
}

fn script(dir: &Path, body: &str) -> PathBuf {
    let path = dir.join("kitty");
    std::fs::write(&path, body).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    path
}

#[tokio::test]
async fn native_validation_never_goes_through_a_shell() {
    let dir = tempfile::tempdir().unwrap();
    let staging = dir.path().join("staging");
    std::fs::create_dir_all(&staging).unwrap();
    let args_log = dir.path().join("args.log");
    // Records each argument on its own line so word-splitting would be visible.
    let binary = script(
        dir.path(),
        &format!(
            "#!/bin/sh\nfor arg in \"$@\"; do printf '%s\\n' \"$arg\" >> '{}'; done\n",
            args_log.display()
        ),
    );

    // A hostile-looking name: if a shell were involved this would run `touch`.
    let hostile_dir = staging.join("a b; touch pwned; $(touch pwned2)");
    std::fs::create_dir_all(&hostile_dir).unwrap();
    let candidate = hostile_dir.join("kitty.conf");
    std::fs::write(&candidate, "font_size 12\n").unwrap();

    let result = validate_candidate(TerminalId::Kitty, &binary, &candidate)
        .await
        .unwrap();

    assert!(result.valid);
    let logged = std::fs::read_to_string(&args_log).unwrap();
    assert_eq!(
        logged.lines().collect::<Vec<_>>(),
        vec!["--config", candidate.to_str().unwrap(), "--debug-config"]
    );
    assert!(!dir.path().join("pwned").exists());
    assert!(!dir.path().join("pwned2").exists());
    assert!(!hostile_dir.join("pwned").exists());
}

#[tokio::test]
async fn staged_candidates_validate_and_a_failing_validator_blocks() {
    let dir = tempfile::tempdir().unwrap();
    let destination = dir.path().join("kitty.conf");
    let binary = script(dir.path(), "#!/bin/sh\necho 'bad option' >&2\nexit 3\n");
    let candidate = stage_text(&destination, "nonsense\n").await.unwrap();

    let result = validate_candidate(TerminalId::Kitty, &binary, &candidate)
        .await
        .unwrap();

    assert!(!result.valid);
    assert!(result.issues[0].message.contains("exit code 3"));
    // Staging never touches the destination and cleans up after itself.
    assert!(!destination.exists());
    remove_staged(&candidate).await.unwrap();
    assert_eq!(names(dir.path()), vec!["kitty"]);
}

#[tokio::test]
async fn ghostty_receives_one_equals_joined_config_file_argument() {
    let dir = tempfile::tempdir().unwrap();
    let args_log = dir.path().join("args.log");
    let binary = dir.path().join("ghostty");
    std::fs::write(
        &binary,
        format!(
            "#!/bin/sh\nfor arg in \"$@\"; do printf '%s\\n' \"$arg\" >> '{}'; done\n",
            args_log.display()
        ),
    )
    .unwrap();
    std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755)).unwrap();
    let candidate = stage_text(&dir.path().join("config"), "font-size = 12\n")
        .await
        .unwrap();

    let result = validate_candidate(TerminalId::Ghostty, &binary, &candidate)
        .await
        .unwrap();

    assert!(result.valid);
    let logged = std::fs::read_to_string(&args_log).unwrap();
    assert_eq!(
        logged.lines().collect::<Vec<_>>(),
        vec![
            "+validate-config".to_string(),
            format!("--config-file={}", candidate.display()),
        ]
    );
}
