# Contributing to Config Forge

Config Forge is a local-first Linux desktop application (Tauri 2, React 19,
TypeScript, and Vite) for creating, importing, previewing, validating,
translating, backing up, and safely applying Ghostty, Kitty, and Alacritty
configurations.

Before starting feature work, read [docs/project-status.md](docs/project-status.md)
and [docs/architecture.md](docs/architecture.md). New user-facing features
should be discussed with the maintainer before implementation.

## Prerequisites

- Linux with the system packages listed in [README.md](README.md#linux-prerequisites)
- Node.js 20.19+ or 22.12+ and npm
- Rust stable (`rustfmt` and `clippy` components)

## Development Workflow

Install dependencies and start either the full desktop shell or the browser-only
frontend server:

```bash
npm install
npm run tauri dev   # desktop shell with SQLite persistence and file workflows
npm run dev         # frontend only on port 1420 (in-memory session drafts)
```

## Project Structure

- `src/domain/` — shared configuration schemas (`zod`) and domain contracts
- `src/adapters/` — terminal parsers, structure-preserving writers, field
  mappings, and the adapter registry (`getAdapter` / `registerAdapter`)
- `src/services/` — validation, cross-terminal translation, project/snapshot/
  template orchestration, safe apply pipeline, and the typed Tauri IPC client
  (`src/services/tauri-client.ts` is the only module that calls `invoke()`)
- `src/state/` — vanilla Zustand project store (`project-store.ts`)
- `src/components/` — layout, visual editor, mock preview, validation, and
  persistent workflow panels
- `src-tauri/src/` — Rust Tauri commands, SQLite repositories (`sqlx`),
  filesystem path detection, backups, checked atomic writes, and native
  validator execution
- `fixtures/` — representative terminal configurations used by tests
- `tests/e2e/` — Playwright end-to-end specs using an in-memory Tauri stand-in

## Coding Conventions

- **TypeScript / React**: strict TypeScript, two-space indentation, double
  quotes, and semicolons (enforced by Prettier and ESLint with
  `--max-warnings=0`). Use `PascalCase` for components and types, `camelCase`
  for functions and variables, and `kebab-case` for module filenames. Preserve
  CSS custom properties in `src/styles/tokens.css`.
- **Rust**: follow `rustfmt` and `snake_case` naming, and keep `cargo clippy --all-targets -- -D warnings` clean.
- **Structure preservation**: every config round-trip must preserve comments,
  blank lines, key ordering, unknown settings, includes, and malformed lines
  through the `DocumentNode[]` tree.
- **Write safety**: reuse the existing backup, validation, and checked
  atomic-write helpers rather than writing files directly. Never follow symlinks
  when applying a config, and never invoke a shell when running a native
  validator.

For adding or modifying terminal adapters, follow
[docs/adapter-authoring.md](docs/adapter-authoring.md).

## Testing and Verification

Colocate unit tests beside TypeScript modules (`*.test.ts`, `*.test.tsx`) and
use inline `#[cfg(test)]` modules (plus `src-tauri/tests/`) for Rust. Always
use `fixtures/` or temporary directories—never read or write personal
configuration files in tests.

Run the full check suite before opening a pull request:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npx playwright install chromium   # once
npm run test:e2e
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Commits and Pull Requests

- Use concise, scoped conventional commit prefixes (`feat:`, `fix:`, `docs:`,
  `chore:`, `refactor:`, `test:`).
- Keep commits focused on a single logical change and preserve unrelated
  worktree changes.
- Pull request descriptions should summarize the behavior change, list the
  verification checks run (and any environment limitations), and include
  screenshots when changing the UI.
