# Config Forge Project Status

Last updated: 2026-09-27

## Pause Boundary

Development is paused after Task 12 of
`docs/config-forge-implementation-plan.md`. The last implementation milestone
is `2483fa1` (`feat: add project history and safe apply orchestration`).
Task 13 has not started.

## Completed Work

| Plan tasks | Deliverable                                                              | Milestone commit |
| ---------- | ------------------------------------------------------------------------ | ---------------- |
| 1-2        | Tauri/React scaffold, test harness, domain types, and validation schemas | `4de2b96`        |
| 3          | Terminal adapter contract and replacement registry                       | `bd3eca3`        |
| 4          | SQLite migrations plus project and snapshot repositories                 | `5481f4e`        |
| 5          | Structure-preserving Ghostty adapter                                     | `2da12d7`        |
| 6          | Structure-preserving Kitty adapter                                       | `70df8a6`        |
| 7          | Structure-preserving Alacritty TOML adapter                              | `c7e646d`        |
| 8          | Adapter registration and cross-terminal translation reports              | `749c2b7`        |
| 9          | Terminal and config path detection (`detect_terminals`)                  | `53c51ec`        |
| 10         | Backups and atomic config writes                                         | `549d0ac`        |
| 11         | Hybrid (internal + native) config validation                             | `c974af4`        |
| 12         | Project/history/template services, safe apply orchestration, and store   | `2483fa1`        |

Task 12 adds project creation/import/save/export services, named and automatic
snapshots, restoration, translation with history, template instantiation and
replacement, and a vanilla Zustand project store. Project and snapshot payloads
validate the full document tree so comments and unsupported settings survive
persistence and restoration. Replacement operations snapshot the current draft
before saving. Opening or saving cannot discard edits made while awaiting I/O;
errors remain visible and are rethrown.

`applyProject` runs generate → validate-internal → validate-native → diff →
confirm → snapshot → backup → atomic-write → verify. Validation errors block
confirmation; warnings remain in the confirmation payload; cancellation returns
normally; earlier failures stop later writes. New destinations skip backup and
return a null backup record. The candidate, target, and confirmed source stay
fixed across confirmation, and overlapping applies to the same project or path
are rejected. Native validation uses terminal detection and the existing
`validate_candidate` command, with injected temporary-candidate staging and
cleanup. Read-back verification compares the actual content and byte count.

Backend support adds transactional snapshot retention (all named snapshots and
the latest 20 automatic snapshots per project), a checked atomic-write helper
that rejects destinations changed since confirmation, and unique backup and
temporary filenames to prevent repeated operations overwriting prior artifacts.
The destination check happens immediately before rename; it is not a filesystem
lock against another process editing in that interval.

### Integration Boundary

Task 12 is the service layer with mocked Tauri-client tests specified in the
plan. The frontend shell does not call these services yet. Task 17 still owns
app-data directories, database initialization, persistence/file IPC bridges,
command registration, and desktop startup. The new `apply_config` Rust command
is defined but not registered. The project/history/read/export client methods
are typed IPC contracts; their Rust command implementations are deferred to
that wiring milestone. No fallback persistence is used.

For Task 17, project rows must store the complete `TerminalProject` JSON.
Snapshot rows must store the complete `ProjectSnapshot` JSON (including its
reason and captured project), and `create_snapshot` must call
`SnapshotRepository::create_retained()` rather than the unretained `create()`.
The frontend passes a retention limit of 20; the backend enforces 20. Wire
`apply_config` to the checked write helper and provide temporary candidate
staging/cleanup for `createNativeValidationDependency()`.

Template catalog content, personal-template CRUD, and the picker remain in
Task 16. Task 12 implements template application and replacement safety only.

## Verification At The Boundary

The following checks passed for the Task 12 milestone on 2026-09-27:

- Vitest: 14 files and 85 tests passed.
- TypeScript: `tsc --noEmit` passed.
- Production frontend build: Vite built 30 modules successfully.
- ESLint: zero warnings; Prettier formatting check passed.
- Rust: 32 tests passed; `cargo fmt --check` and
  `cargo clippy --all-targets -- -D warnings` passed.
- `git diff --check`: passed.

Browser E2E tests and the desktop shell were not run because this milestone
changes services and backend helpers without changing the rendered UI. Service
IPC behavior is covered with mocks; no live desktop persistence or apply flow
is claimed. All filesystem tests use temporary directories, not personal
terminal configs.

## Dependency Status

The Task 11 status previously recorded a Nano ID 3.3.16 advisory. Subsequent
commit `89325d5` updated it; `npm ls nanoid` now reports 3.3.19 through
Vite/PostCSS. Task 12 made no dependency changes. Dependency audits were not
rerun for this milestone, so no current audit result is claimed.

## Next Planned Work

Resume with Task 13: build the Home Screen and Split Studio shell, consuming
these services and the project store. Preserve the existing visual language
unless the user approves a redesign. Do not start Task 13 without a new request.
