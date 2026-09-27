# Config Forge

Config Forge is a local-first Linux desktop application for creating,
importing, previewing, validating, translating, backing up, and safely applying
Ghostty, Kitty, and Alacritty configurations.

The current implementation includes:

- A Tauri 2 desktop shell with a React and TypeScript frontend.
- Strict type checking, ESLint, Prettier, Vitest, and Playwright.
- Portable configuration and project schemas for the three v1 terminals.
- Domain contracts for preserved document nodes, validation results, and
  recoverable application errors.
- SQLite migrations and repositories for projects and snapshots.
- Independently tested, structure-preserving adapters for Ghostty, Kitty, and
  Alacritty.

Development is paused at the verified Task 7 boundary. See
`docs/project-status.md` for the exact implementation state and
`docs/config-forge-implementation-plan.md` for the complete roadmap.

![Screenshot of app](docs/img/config-forge-UI.png)

## Prerequisites

- Node.js 20.19+ or 22.12+ and npm.
- Rust stable.
- The Linux packages listed in the
  [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

On Ubuntu or Debian:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

## Development

```bash
npm install
npm run tauri dev
```

The frontend can also run independently with `npm run dev`.

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Install Playwright's pinned Chromium build once, then run the browser smoke
test:

```bash
npx playwright install chromium
npm run test:e2e
```
