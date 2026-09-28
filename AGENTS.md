# Repository Guidelines

## Project Structure & Module Organization

Config Forge configures Ghostty, Kitty, and Alacritty on Linux using React,
TypeScript, Vite, and Tauri 2.

- `src/app/` contains the application shell; `src/styles/` holds CSS and tokens.
- `src/domain/` defines shared schemas and contracts; `src/adapters/` contains
  terminal parsers, writers, mappings, and the adapter registry.
- `src/services/` contains translation, validation, and the typed Tauri client.
- `src-tauri/src/` contains Rust commands, SQLite repositories, filesystem
  operations, and native validation; migrations live in `src-tauri/migrations/`.
- Unit tests sit beside TypeScript modules; browser tests live in `tests/e2e/`.
  `fixtures/` holds terminal configurations, `src/test/` shared test helpers,
  and `src-tauri/icons/` desktop assets.

## Build, Test, and Development Commands

Run `npm install`; see `README.md` for prerequisites.

- `npm run dev`: frontend server on port 1420.
- `npm run tauri dev`: desktop development shell.
- `npm run build`: type-check and build the frontend.
- `npm run tauri build`: build desktop bundles.
- `npm test`: run Vitest; `npm run test:watch` enables watch mode.
- `npm run test:e2e`: Playwright desktop/mobile Chromium checks; first run
  `npx playwright install chromium`.
- `npm run lint`, `npm run typecheck`, `npm run format:check`: static checks.
- `cargo test --manifest-path src-tauri/Cargo.toml`: Rust tests.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` and
  `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`:
  Rust style and lint checks.

## Coding Style & Naming Conventions

Use strict TypeScript, domain types, two-space indentation, double
quotes, and semicolons; Prettier and ESLint enforce frontend conventions.
Use PascalCase for components/types, camelCase for functions, and kebab-case
module filenames such as `validation-service.ts`. Follow rustfmt and
snake_case for Rust functions/modules. Preserve CSS tokens.

## Testing Guidelines

Use colocated `*.test.ts`/`*.test.tsx` files with Vitest and Testing Library;
name Playwright tests `*.spec.ts`. Rust tests use inline `#[cfg(test)]` modules.
Add regression coverage for changed behavior, especially config round-tripping,
unknown-content preservation, validation failures, and safe writes. Tests must
use fixtures or temporary directories rather than personal configuration files.
V8 coverage is available via `npm test -- --coverage`; no minimum is configured.

## Commit & Pull Request Guidelines

Use `feat:`, `docs:`, and `chore:` with concise descriptions.
Keep commits scoped. PRs should describe behavior, reference issues
or roadmap tasks, report checks and limitations, and include screenshots for UI
changes. Preserve unrelated worktree changes.

## Roadmap & Configuration Safety

Read `docs/project-status.md` and `docs/config-forge-implementation-plan.md`
before feature work; respect the recorded pause boundary. Preserve comments,
ordering, and unsupported settings. Reuse existing backup, validation, and atomic
write helpers; surface failures explicitly.

## Here are my project prefernces

1. Inline execution
2. No TDD
3. No final, whole-branch review with "GPT-6 Astra". Skip the review if not necessary. I can address any bugs in it later, if necessary.
4. This is just a personal utility app. Do not be too catious about taking small risks to improve the app. If you discover a way to make the app better or add a new feature, consult w/me and we can most likely do it.
5. Try and be "token-efficient" if possible.