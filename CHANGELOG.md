# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Desktop startup: app-data directories, SQLite in WAL mode, migrations, and a
  blocking, retryable error when startup fails.
- Registered Tauri commands for projects, snapshots, personal templates, file
  reads, export, apply, candidate staging, path inspection, and app paths.
- Save and reopen of projects, including new drafts; complete project and
  document JSON is stored so comments and unknown settings survive.
- Reviewed Apply (diff, confirmation, snapshot, backup, checked atomic write,
  read-back verification), export to a new file, translation into a new project
  with its report, and named snapshots with confirmed restore.
- Playwright specs for create, import, translate, and safe apply, backed by an
  in-memory Tauri stand-in; Rust integration tests for the safe-apply pipeline.
- README, architecture, adapter-authoring, and recovery documentation; CI
  workflow; third-party notices; favicon.

### Changed

- `validate_candidate` now accepts only the terminal binary the backend resolves
  from `PATH` and a file staged under the app staging directory.
- The unchecked `write_file_atomically` command is no longer registered.

### Known gaps

- AppImage and Debian bundles are configured and built in CI; clean-account
  install and uninstall smoke tests are manual and have not been recorded.
- Native desktop launch against a real display was not exercised in automated
  checks.

## [0.1.0] - Foundation

- Tauri 2 / React 19 scaffold, domain schemas, Ghostty, Kitty, and Alacritty
  adapters, translation reports, detection, backups, atomic writes, hybrid
  validation, project services, Home and Split Studio shell, visual controls,
  mock preview, source editing and diffs, and the template catalog.
