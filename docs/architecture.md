# Architecture

Config Forge is a Tauri 2 desktop app: a React 19 / TypeScript frontend talks to
a Rust backend over a small, explicit command surface. Everything runs locally.

## The shared-model pivot

Every terminal config is parsed into three things:

1. a portable `SharedConfig` (`src/domain/shared-config.ts`, zod) holding the
   settings all three terminals understand,
2. terminal-specific `overrides` for what does not map, and
3. a `DocumentNode[]` tree (`src/domain/document-node.ts`) that retains
   comments, blank lines, ordering, unknown settings, includes, sections, and
   malformed lines.

The visual editor edits the shared model. Generation walks the node tree and
re-emits original text for untouched nodes, patching only nodes whose recognised
value changed. This is why unknown or hand-written content survives edits and
round trips. Any change that touches parse/generate must keep the regression
tests for this behavior green.

## Adapters

`src/adapters/<terminal>/` implement `TerminalAdapter`
(`terminal-adapter.ts`): `parse`, `generate`, `validateInternal`,
`extractPortable`, `createOverrides`, and `supportedSharedPaths`. Ghostty and
Kitty are line-based; Alacritty is TOML via `@iarna/toml`. Services reach
adapters only through `registry.ts` (`getAdapter` / `registerAdapter`). See
[adapter-authoring.md](adapter-authoring.md).

## Frontend layers

| Layer      | Location                        | Responsibility                                                      |
| ---------- | ------------------------------- | ------------------------------------------------------------------- |
| Domain     | `src/domain/`                   | zod schemas and types: projects, snapshots, templates, validation   |
| Services   | `src/services/`                 | orchestration, tested with an injected `ProjectClient`              |
| IPC client | `src/services/tauri-client.ts`  | the only place that calls `invoke()`                                |
| Store      | `src/state/project-store.ts`    | vanilla Zustand; edits during in-flight I/O are never discarded     |
| Startup    | `src/app/startup.ts`, `App.tsx` | loads detection, projects, templates, paths; blocking error + retry |
| UI         | `src/components/`               | layout (Home, Split Studio), editor, preview, validation, workflows |

Key services:

- `apply-service.ts` — `applyProject`: generate → validate-internal →
  validate-native → diff → **confirm** → snapshot → backup → atomic write →
  verify. Validation errors block; cancellation returns normally; overlapping
  applies to the same project or path are rejected.
- `studio-workflows.ts` — binds the services to the app-data paths (backup
  root, export directory, hidden candidate copies for validation) for the Studio panels.
- `validation-service.ts` aggregates schema, adapter, target-path, and
  translation issues. `translation-service.ts` builds cross-terminal reports.
- `project-service.ts` — create/import/save/export, snapshots, restore.
- `template-service.ts` — built-in catalog plus personal templates and bundles.

Without the desktop shell (`npm run dev`, Playwright), `App` renders without
persistence and drafts stay in memory; Save and Apply are disabled rather than
faked.

## Rust backend (`src-tauri/src/`)

| Module        | Responsibility                                                               |
| ------------- | ---------------------------------------------------------------------------- |
| `lib.rs`      | startup (`AppState::initialize`), plugin and command registration            |
| `state.rs`    | `AppState`: environment, database, data/backup/export directories    |
| `commands/`   | thin Tauri commands over testable functions                                  |
| `db/`         | sqlx SQLite repositories (WAL) and `migrations/0001_initial.sql`             |
| `filesystem/` | `paths` (detection), `atomic_write`, `backup`                                |
| `process/`    | native validation with a timeout and output cap; backend picks the arguments |
| `error.rs`    | `AppError`, serialized to the frontend as a plain message                    |

Startup resolves the app-data directory, creates the directories, opens SQLite
in WAL mode, runs migrations, and manages `AppState`. If any step fails the app
shows a blocking error dialog and exits instead of running with a partial
database; the frontend likewise shows a retryable startup error.

### Registered commands

`detect_terminals`, `get_app_paths`, `create_project`, `get_project`,
`list_projects`, `save_project`, `create_snapshot`, `get_snapshot`,
`list_snapshots`, `list_templates`, `get_template`, `create_template`,
`update_template`, `delete_template`, `create_config_backup`, `inspect_path`,
`read_text_file`, `read_optional_text_file`, `export_config`, `apply_config`,
`stage_candidate`, `remove_staged_candidate`, `validate_candidate`.

The `fs` and `shell` plugins are not registered; the dialog plugin is used only
for the startup error. A smoke test (`lib.rs`) drives the registered handler
through Tauri's mock runtime.

### Persistence rules

- Project rows store the complete `TerminalProject` JSON; the columns are only
  an index. Snapshot rows store the complete `ProjectSnapshot` JSON.
- Snapshots are inserted with `create_retained`, which prunes automatic
  snapshots beyond 20 per project in the same transaction. Named snapshots are
  never pruned.
- Personal templates only; built-in templates live in the frontend catalog and
  a claimed `builtIn` flag is rejected.

### Write-safety rules

- Paths from the frontend must be absolute and free of `..`.
- `apply_config` uses `atomic_replace_if_unchanged`: write a temporary sibling,
  fsync, compare the destination with the content the user reviewed, rename,
  read back, and hash. A changed destination, a destination that appeared after
  being reviewed as new, or a symlink is refused and leaves the original alone.
- `export_config` creates new files only.
- `validate_candidate` accepts only the binary the backend itself resolves from
  `PATH` and a regular file staged by `stage_candidate`, runs it with fixed
  arguments, and never uses a shell. The staged file is a hidden sibling of the
  destination so relative includes resolve; it is removed afterwards. Alacritty
  is never launched for validation.
- `create_config_backup` only writes below the app backup directory.
