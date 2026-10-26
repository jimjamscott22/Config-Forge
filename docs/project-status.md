# Config Forge Project Status

Last updated: 2026-10-25

## Current Scope

Tasks 1–16 of `docs/config-forge-implementation-plan.md` are complete. Tasks 15
and 16 were resumed on request on 2026-10-25. Tasks 17–19 remain pending; Task
17 is next and requires a new request.

## Pause Boundary

Development is paused after Task 16. Do not start Task 17 without a new
request. When work resumes, read this document and the implementation plan.
Preserve the recorded verification limits: native desktop persistence/apply and
release package workflows remain unverified.

## Completed Work

| Plan tasks | Deliverable                                                               | Milestone commit |
| ---------- | ------------------------------------------------------------------------- | ---------------- |
| 1-2        | Tauri/React scaffold, test harness, domain types, and validation schemas  | `4de2b96`        |
| 3          | Terminal adapter contract and replacement registry                        | `bd3eca3`        |
| 4          | SQLite migrations plus project and snapshot repositories                  | `5481f4e`        |
| 5          | Structure-preserving Ghostty adapter                                      | `2da12d7`        |
| 6          | Structure-preserving Kitty adapter                                        | `70df8a6`        |
| 7          | Structure-preserving Alacritty TOML adapter                               | `c7e646d`        |
| 8          | Adapter registration and cross-terminal translation reports               | `749c2b7`        |
| 9          | Terminal and config path detection (`detect_terminals`)                   | `53c51ec`        |
| 10         | Backups and atomic config writes                                          | `549d0ac`        |
| 11         | Hybrid (internal + native) config validation                              | `c974af4`        |
| 12         | Project/history/template services, safe apply orchestration, and store    | `2483fa1`        |
| 13         | Home Screen, create/import drafts, and responsive Split Studio shell      | `ba9d0c7`        |
| 14         | Shared-model visual controls and mock terminal preview                    | `ff8accb`        |
| 15         | Editable source, diff viewer, grouped diagnostics, unmapped settings      | `c744a13`        |
| 16         | Built-in catalog, personal-template CRUD/bundles, picker, Rust repository | see git log      |

Task 11 completed hybrid validation: `validateProject()` aggregates schema,
adapter, target-path, and translation issues, while `validate_candidate` runs
backend-chosen native validator arguments with timeout and output limits.

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

Task 13 replaces the foundation placeholder with a Home Screen and Studio,
keeping the existing paper/copper palette and typography. Home has equally
prominent create/import actions, terminal cards, recent projects, a resumable
current draft, and a built-in-template section with an honest empty state.
Create and import workflows open session drafts via the existing services and
store. Imports accept a file or pasted source, reject parser errors explicitly,
and never infer a live filesystem path from a browser filename. Replacing the
current draft requires confirmation; cancellation preserves it.

The Studio has desktop project navigation, a settings overview, and a
Preview/Source/Validation workspace. At narrow widths it uses four keyboard-
operable tabs (Controls, Preview, Source, Validation) and sticky actions, with
no horizontal scrolling at 320 CSS pixels. Source is generated by the actual
adapter and displayed read-only; validation uses `validateProject()`. At the Task 13 boundary, controls
and preview had explicit placeholders; Task 14 has now replaced them. Save and Apply are disabled
rather than presenting unimplemented operations as successful.

Browser testing exposed two integration issues fixed in this milestone:
Alacritty value spans and array-table metadata now survive payload validation,
and Vite maps the TOML dependency's Node `global` reference to `globalThis` so
it works in both development and production browsers.

### Task 14: Visual Controls and Mock Preview

Controlled typography, appearance/cursor, color/ANSI, and behavior editors now
update the shared model through the project store. Each field validates on
change, labels its native mapping and translation support, and supports reset
to terminal defaults. Invalid text remains visible with an error and does not
replace the last valid model value. Unsupported mappings and preserved known
settings outside the model stay read-only rather than silently discarding an
edit. The original document tree and terminal overrides survive visual edits.

The preview derives typography, colors, palette, spacing, opacity, selection,
and cursor from a pure model. It includes a prompt, branch, tabs, scrollback,
style samples, and ANSI swatches without executing commands. Unset values use
explicitly labeled illustrative defaults; installed fonts are used locally.
Kitty padding reflects its existing symmetric mapping. Cursor blinking stops
under reduced motion. Extreme fonts/padding stay inside the preview frame,
including at 320 CSS pixels.

An adjacent preservation fix retains Alacritty inline comments and line endings
when resetting a recognized setting. Terminal-specific/unmapped content is
inspectable and remains read-only; editable source is still Task 15. Save/Apply
and live persistence remain Task 17.

### Task 15: Source Editing, Diffs, and Diagnostics

The Source tab shows the generated source read-only with an **Edit source**
action. Editing opens a plain textarea (see rulings), parses after a 400 ms
debounce through `reconcileSourceEdit(project, source)`, and never overwrites the
typed text after a parse error. Parse errors disable **Apply source edit** and
show line diagnostics. Edits that introduce unknown, malformed, include, or
otherwise unmapped lines require ticking a diff-review checkbox, as does applying
after the visual controls changed mid-edit. Removing preserved lines is reported
but does not require confirmation. **Revert to Generated Source** discards the
edit. Applied edits replace the project's shared model, overrides, and document
tree via `store.edit()`; they remain a session draft.

`DiffViewer` renders added/removed/unchanged lines with an optional destination
block (path, backup destination, symlink behaviour — the backend refuses to
write through symlinks), blocking validation errors, and a confirmation
checkbox. Today it only compares generated vs edited source; Task 17 can reuse
it for live-config vs candidate with real destination data. `ValidationPanel`
groups Errors/Warnings/Information. `UnmappedSettings` (replacing
`TerminalOverrides`) groups Terminal-specific, Unknown, Malformed, and
Include/directive content, plus a translation-only warning listing settings
omitted from the portable subset.

Rulings: a textarea replaces CodeMirror because `@codemirror/commands`
(undo/keymap) is not installed, jsdom support is poor, and a native textarea is
accessible and works at 320 px; the CodeMirror packages remain installed and can
be swapped in later. Source-line diagnostics are listed beneath the editor, not
inline.

### Task 16: Templates

`src/templates/builtins.ts` ships eight original, deep-frozen, portable
templates: Blank, Modern Dark, Modern Light, High Contrast Dark/Light, Retro
Green, Presentation, and Minimal (no third-party palettes or attribution). Tests
assert every built-in generates an error-free config on all three terminals.

`createTemplateService(client)` lists built-ins first then personal templates
(filterable by terminal; portable templates match every terminal), and supports
createFromProject, duplicate, rename, update, and remove. Built-ins reject
update/remove with `BUILTIN_TEMPLATE_IMMUTABLE`; duplicate them to edit. JSON
bundles (`format: "config-forge-templates"`, `version: 1`) export without ids or
the built-in flag; import validates the whole bundle first, then stores every
entry as a new personal template with a fresh id, never trusting a claimed
built-in flag. Personal templates keep only shared settings plus terminal
overrides, not comments or unknown lines.

`TemplatePicker` replaces the Home template list (heading is now "Templates")
with a terminal filter and, when a service is supplied, Duplicate / Export /
Rename / Delete (confirmed) and Import bundle. Studio gets **Save as template**
when a service is supplied. `AppRoutes` defaults to the built-ins and takes an
optional `templateService`; none is supplied yet, so the UI shows built-ins plus
a note that personal templates need desktop storage. No fallback persistence.

Backend: `db/templates.rs` (`TemplateRepository`: create/get/list/update/delete)
stores personal templates only — every query filters `built_in = 0`, terminals
are validated (ghostty/kitty/alacritty/portable), and `AppError::InvalidInput`
was added. `TemplateClient` in `tauri-client.ts` types the IPC contract
(`list_templates`, `get_template`, `create_template`, `update_template`,
`delete_template`); like the project commands, these are unregistered until
Task 17, which must also set `created_at`/`updated_at` in those commands and
instantiate `createTemplateService()` in routes.

### Integration Boundary

Task 13 calls the draft, template, adapter, validation, and store APIs. Drafts
are explicitly kept only in the current session; they are not a fallback for
failed persistence. Recent projects come from the project store, and template
data can be supplied to the routes. The default UI does not load a database or
invent a template catalog before their planned wiring milestones. Terminal
detection uses the existing Tauri command in the desktop runtime and reports
unavailable/failed detection without blocking browser draft workflows.

Task 17 still owns app-data directories, database initialization,
persistence/file IPC bridges, command registration, and desktop startup. The new `apply_config` Rust command
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

Task 16 added the catalog, personal-template CRUD, and picker; Task 12 owns
template application and replacement safety.

## Verification At The Boundary

The following checks passed for Task 13 on 2026-09-29:

- Vitest: 17 files and 101 tests passed.
- TypeScript: `tsc --noEmit` passed as part of the production build.
- Production frontend build: Vite built 163 modules successfully.
- ESLint: zero warnings; Prettier formatting check passed.
- Playwright: 12 desktop/mobile Chromium tests passed, including all three
  terminal file imports, draft/resume navigation, invalid-import recovery,
  keyboard tabs, source preservation, and 320-pixel overflow checks.
- Production preview smoke: Home, Alacritty import/source preservation,
  validation, responsive tabs, and visible sticky actions passed at desktop
  and 320 pixels; no browser errors occurred in these flows.
- Desktop/mobile screenshots were inspected and saved outside the repository
  under `/tmp/config-forge-task13-*.png`.
- `git diff --check`: passed.

The Browser plugin was unavailable; rendered checks used the repository's
Playwright workflow against `http://127.0.0.1:1420` and production preview at
`http://127.0.0.1:1422`. The native desktop shell and live persistence/apply
workflow were not launched. Rust is unchanged in Task 13; its last verified
boundary remains the Task 12 run of 32 tests, rustfmt, and Clippy.

## Dependency Status

The Task 11 status previously recorded a Nano ID 3.3.16 advisory. Subsequent
commit `89325d5` updated it; `npm ls nanoid` now reports 3.3.19 through
Vite/PostCSS. Tasks 12–13 made no dependency changes. Dependency audits were not
rerun for this milestone, so no current audit result is claimed. Vite still
emits upstream `@iarna/toml` warnings about its unused Node stream entry point
and optional `eval` inspection code; the production browser smoke passed.

## Remaining MVP Work

- Task 17: app-data/database startup and migrations, IPC implementations and
  registration (including the five template commands), native candidate staging/cleanup, and persistent workflows.
  Include Save/reopen, Apply, export, translation/report, and history/restore UI.
- Task 18: complete workflow and safe-apply integration coverage.
- Task 19: CI, operator/contributor/recovery documentation, verified Linux
  packages, and clean-account release smoke tests.

The AppImage/Debian bundle targets already exist, but package builds and
packaged workflows have not been verified. Existing Playwright tests cover
session draft/import flows, not live desktop persistence or writes.

## Assessment Verification (2026-10-06)

Fresh checks passed: 101 Vitest tests in 17 files, 32 Rust tests, 12
Playwright desktop/mobile tests, production frontend build (including TypeScript
checking), ESLint, Prettier, rustfmt, and Clippy with warnings denied. The build
still reports upstream `@iarna/toml` stream/eval warnings. Native desktop launch,
live persistence/apply, dependency audits, and release package builds were not
performed in this assessment.

## Task 14 Verification (2026-10-06)

- Vitest: 20 files and 111 tests passed.
- Production frontend build (including TypeScript checking): passed, 174 modules.
- ESLint, Prettier, and `git diff --check`: passed.
- Playwright: 20 desktop/mobile Chromium tests passed, including three-terminal
  edit/source preservation, invalid-input recovery, reset, preview styling,
  reduced motion, and containment at 320 pixels with extreme settings.
- Rendered controls and preview screenshots inspected at desktop/mobile sizes;
  images are outside the repository under `/tmp/config-forge-task14-preview-*`.
- Browser plugin skill unavailable; browser verification used the repository's
  Playwright workflow against `http://127.0.0.1:1420`.
- Native desktop launch, live persistence/apply, and package builds were not run.
  Rust is unchanged; its 32 tests, rustfmt, and Clippy passed in the assessment.

## Task 15 Verification (2026-10-25)

- Vitest: 23 files and 126 tests passed.
- Playwright: 22 desktop/mobile Chromium tests passed, including a new
  source-edit round trip.
- Production build (including TypeScript checking), ESLint, and Prettier passed.
- Rust is unchanged; native desktop launch, live persistence/apply, dependency
  audits, and package builds were not run.

## Task 16 Verification (2026-10-25)

- Vitest: 24 files and 141 tests passed.
- Playwright: 24 desktop/mobile Chromium tests passed (new templates spec).
- Rust: 36 tests passed (4 new `db::templates`), rustfmt and Clippy with warnings
  denied passed.
- Production build (including TypeScript checking), ESLint, and Prettier passed.
- Native desktop launch, live persistence/apply, dependency audits, and package
  builds were not run.

## Next Planned Work

Task 17: app-data/database startup, IPC implementation and registration
(projects, snapshots, files, apply, templates), native candidate staging, and
persistent workflows. Reuse `DiffViewer` for the apply review. Do not start Task
17 or later milestones without a new request.
