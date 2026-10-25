# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Config Forge is a local-first Linux desktop app (Tauri 2 + React 19 + TypeScript + Vite) for creating, importing, previewing, validating, translating, backing up, and safely applying Ghostty, Kitty, and Alacritty configs. `AGENTS.md` has the contributor guidelines; the essentials are repeated below.

## Commands

```bash
npm install
npm run dev                  # frontend only, port 1420 (strictPort)
npm run tauri dev            # desktop shell
npm run build                # tsc --noEmit && vite build
npm run lint                 # eslint, --max-warnings=0
npm run typecheck
npm run format:check         # prettier (npm run format to fix)
npm test                     # vitest run (jsdom, src/**/*.test.{ts,tsx})
npx vitest run src/adapters/ghostty/ghostty-adapter.test.ts   # single file
npx vitest run -t "name fragment"                             # single test by name
npx playwright install chromium   # once
npm run test:e2e             # Playwright desktop + Pixel 5 projects; auto-starts `npm run dev`
cargo test --manifest-path src-tauri/Cargo.toml [test_name]
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Full check before a milestone: format:check, lint, typecheck, test, build, cargo test/fmt/clippy, test:e2e.

## Architecture

**The shared-model pivot.** Every terminal config is parsed into a portable `SharedConfig` (`src/domain/shared-config.ts`, zod) *plus* terminal-specific `overrides` *plus* a `DocumentNode[]` tree (`src/domain/document-node.ts`) that retains comments, blanks, ordering, unknown settings, includes, and malformed lines. The visual editor edits the shared model; the adapter re-generates source from the node tree, patching only modified nodes. This is how unsupported/unknown content survives round-trips — any change touching parse/generate must preserve it (there are regression tests for this; keep them green).

**Adapters** (`src/adapters/<terminal>/`) implement `TerminalAdapter` (`terminal-adapter.ts`): `parse`, `generate`, `validateInternal`, `extractPortable`, `createOverrides`, `supportedSharedPaths`. Each terminal has its own parser/writer/mappings (Alacritty is TOML via `@iarna/toml`; Ghostty/Kitty are line-based). Adapters are looked up through `registry.ts` (`getAdapter`/`registerAdapter`), not imported directly by services.

**Services** (`src/services/`) hold orchestration and are tested with injected clients:
- `tauri-client.ts` — the only place that calls `invoke()`; `ProjectClient` is the typed IPC contract.
- `apply-service.ts` — `applyProject` pipeline: generate → validate-internal → validate-native → diff → confirm → snapshot → backup → atomic-write → verify. Validation errors block; cancellation returns normally; overlapping applies to the same project/path are rejected.
- `validation-service.ts` (`validateProject` aggregates schema + adapter + target path + translation issues), `translation-service.ts` (cross-terminal reports: each portable field is exact / omitted / defaulted), `project-service.ts` (create/import/save/export, snapshots, restore), `template-service.ts`.
- `src/state/project-store.ts` — vanilla Zustand store built by `createProjectStore(client)`; edits made during in-flight I/O must not be discarded.

**UI**: `src/app/routes.tsx` → `components/layout` (Home, responsive Split Studio), `components/editor` (visual controls driven by `control-fields.ts`), `components/preview` (pure `preview-model.ts` → mock terminal; executes nothing). Drafts from create/import are session-only until persistence lands.

**Rust backend** (`src-tauri/src/`): `commands/` (Tauri commands), `filesystem/` (`paths`, `atomic_write`, `backup`), `process/` (native validation with timeout/output caps; backend picks validator args), `db/` (sqlx SQLite repositories + `migrations/0001_initial.sql`), `error.rs`, `state.rs` (injectable `Environment` for tests). Reuse the existing backup/validation/atomic-write helpers rather than writing files directly.

## Current state (read before feature work)

Tasks 1–15 of `docs/config-forge-implementation-plan.md` are done; development is **paused after Task 15** — don't start Task 16+ without a new request. Read `docs/project-status.md` and the plan first.

Important gap: `src-tauri/src/lib.rs` registers only `detect_terminals`, `create_config_backup`, `write_file_atomically`, and `validate_candidate`. The project/snapshot/`read_text_file`/`export_config`/`apply_config` commands in `ProjectClient` are typed contracts with no registered Rust implementation yet (Task 17 owns DB startup, command registration, and native candidate staging). Don't assume those IPC calls work in the desktop runtime; Save/Apply are intentionally disabled in the UI.

## Conventions

- Strict TS, two-space indent, double quotes, semicolons (Prettier/ESLint enforce). PascalCase components/types, camelCase functions, kebab-case module filenames. Rust: rustfmt + snake_case. Preserve CSS tokens in `src/styles/tokens.css`.
- Tests are colocated (`*.test.ts[x]`, Rust inline `#[cfg(test)]`); Playwright specs are `tests/e2e/*.spec.ts`. Use `fixtures/` or temp dirs — never personal config files.
- Commits: `feat:` / `docs:` / `chore:` prefixes, scoped. Preserve unrelated worktree changes.
- `vite.config.ts` maps `global` → `globalThis` for `@iarna/toml`; keep it.

## Project preferences (from AGENTS.md)

- Inline execution; no TDD (add regression coverage for changed behavior, but don't write tests first).
- Skip the final whole-branch review unless necessary; the user will handle bugs later.
- Personal utility app: small risks are fine, but keep regression coverage and preserve critical settings. Consult the user before adding new features or ideas.
- Be token-efficient.
