# Config Forge v1 Implementation Plan

**superpowers skills to use. Do not use any of the other ones:** 
1. 'verification-before-completion'
2. 'finishing-a-development-branch'
3. If needed: 'systematic-debugging' 
4. Okay to write a spec sheet. Use 'writing-plans' for that.

**Goal:** Build a local-first Linux desktop application that visually creates, imports, previews, validates, translates, backs up, and safely applies Ghostty, Kitty, and Alacritty configurations.

**Architecture:** Use a React and TypeScript Split Studio frontend inside Tauri 2. Keep portable configuration logic and terminal adapters in pure TypeScript modules, while Rust owns SQLite, path discovery, native validation, backups, and atomic filesystem writes. Each project targets one terminal and stores shared settings, terminal overrides, preserved document nodes, unmapped settings, and snapshots.

**Tech Stack:** Tauri 2, Rust stable, React, TypeScript, Vite, Zustand, Zod, CodeMirror 6, Vitest, Testing Library, Playwright, SQLite, `sqlx`, `serde`, `thiserror`, `tempfile`, and `similar`.

## Global Constraints

- Target Linux desktop only for v1.
- Support Ghostty, Kitty, and Alacritty only.
- Keep the application fully functional without an account or network connection.
- Store projects and history in SQLite; store imports, exports, and backups as ordinary files.
- Use one terminal per project.
- Preserve comments, ordering, blank lines, include directives, and unknown settings where possible.
- Warn and preserve unknown or unmapped settings.
- Translate only the defined portable shared-setting subset.
- Translation creates a new project and never modifies the source project.
- Require a visible diff, snapshot, filesystem backup, atomic write, and read-back verification before direct apply.
- Use internal validation continuously and native validation when supported.
- Do not execute arbitrary shell strings; invoke fixed binaries with argument arrays.
- Use TDD for domain logic, adapters, repositories, and privileged filesystem operations.
- Keep files focused and adapters independently testable.

---

## Planned Repository Structure

```text
config-forge/
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── README.md
├── docs/
│   ├── architecture.md
│   ├── adapter-authoring.md
│   └── recovery.md
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.tsx
│   │   └── startup.ts
│   ├── components/
│   │   ├── layout/
│   │   ├── editor/
│   │   ├── preview/
│   │   ├── validation/
│   │   ├── history/
│   │   └── common/
│   ├── domain/
│   │   ├── project.ts
│   │   ├── shared-config.ts
│   │   ├── document-node.ts
│   │   ├── validation.ts
│   │   ├── translation.ts
│   │   └── errors.ts
│   ├── adapters/
│   │   ├── terminal-adapter.ts
│   │   ├── registry.ts
│   │   ├── ghostty/
│   │   ├── kitty/
│   │   └── alacritty/
│   ├── services/
│   │   ├── project-service.ts
│   │   ├── translation-service.ts
│   │   ├── apply-service.ts
│   │   ├── template-service.ts
│   │   └── tauri-client.ts
│   ├── state/
│   │   ├── project-store.ts
│   │   └── ui-store.ts
│   ├── templates/
│   │   └── builtins.ts
│   ├── styles/
│   │   ├── tokens.css
│   │   └── app.css
│   └── test/
│       ├── setup.ts
│       └── fixtures/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── migrations/
│   │   └── 0001_initial.sql
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── projects.rs
│       │   ├── files.rs
│       │   ├── detection.rs
│       │   ├── validation.rs
│       │   └── backups.rs
│       ├── db/
│       │   ├── mod.rs
│       │   ├── migrations.rs
│       │   ├── projects.rs
│       │   ├── snapshots.rs
│       │   └── templates.rs
│       ├── filesystem/
│       │   ├── mod.rs
│       │   ├── atomic_write.rs
│       │   ├── backup.rs
│       │   └── paths.rs
│       ├── process/
│       │   ├── mod.rs
│       │   └── native_validation.rs
│       └── error.rs
├── tests/
│   └── e2e/
│       ├── create-project.spec.ts
│       ├── import-config.spec.ts
│       ├── translate-project.spec.ts
│       └── safe-apply.spec.ts
└── fixtures/
    ├── ghostty/
    ├── kitty/
    └── alacritty/
```

---

### Task 1: Scaffold the Tauri Application and Test Harness

**Files:**
- Create: all root Tauri/Vite scaffold files
- Create: `src/test/setup.ts`
- Create: `src/app/App.tsx`
- Create: `src-tauri/src/lib.rs`
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`

**Interfaces:**
- Produces: a launchable Tauri 2 application, `npm run test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck`, and `npm run tauri dev`.

- [ ] **Step 1: Install Linux build prerequisites**

Run on Ubuntu or Debian:

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

Expected: packages install successfully and return to the prompt.

- [ ] **Step 2: Create the React/TypeScript Tauri project**

```bash
npm create tauri-app@latest config-forge -- \
  --template react-ts \
  --manager npm
cd config-forge
```

Expected: `src/`, `src-tauri/`, `package.json`, and `vite.config.ts` exist.

- [ ] **Step 3: Install frontend dependencies**

```bash
npm install zustand zod @codemirror/state @codemirror/view \
  @codemirror/language @codemirror/legacy-modes diff
npm install -D vitest jsdom @testing-library/react \
  @testing-library/jest-dom @testing-library/user-event \
  @playwright/test eslint prettier
```

Expected: dependencies are added to `package.json` without audit-blocking errors.

- [ ] **Step 4: Configure Vitest**

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add to `vite.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
```

- [ ] **Step 5: Add scripts**

Set the relevant `package.json` scripts to:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests --max-warnings=0",
    "format:check": "prettier --check ."
  }
}
```

- [ ] **Step 6: Add the smoke test**

Create `src/app/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "./App";

test("renders the Config Forge application title", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: "Config Forge" }),
  ).toBeInTheDocument();
});
```

Create `src/app/App.tsx`:

```tsx
export function App() {
  return (
    <main>
      <h1>Config Forge</h1>
      <p>Terminal configuration studio</p>
    </main>
  );
}
```

- [ ] **Step 7: Run verification**

```bash
npm run test
npm run typecheck
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all commands exit with code 0.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: scaffold Config Forge desktop app"
```

---

### Task 2: Define Domain Types and Validation Schemas

**Files:**
- Create: `src/domain/shared-config.ts`
- Create: `src/domain/project.ts`
- Create: `src/domain/document-node.ts`
- Create: `src/domain/validation.ts`
- Create: `src/domain/errors.ts`
- Test: `src/domain/shared-config.test.ts`
- Test: `src/domain/project.test.ts`

**Interfaces:**
- Produces: `SharedConfig`, `TerminalProject`, `DocumentNode`, `ValidationIssue`, `AppError`, `sharedConfigSchema`, and `terminalProjectSchema`.

- [ ] **Step 1: Write failing schema tests**

Create `src/domain/shared-config.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { sharedConfigSchema } from "./shared-config";

describe("sharedConfigSchema", () => {
  test("accepts a portable Ghostty-like profile", () => {
    const result = sharedConfigSchema.safeParse({
      font: {
        family: "JetBrains Mono",
        boldFamily: null,
        italicFamily: null,
        boldItalicFamily: null,
        size: 13,
      },
      colors: {
        foreground: "#c6d0f5",
        background: "#303446",
        cursor: "#f2d5cf",
        cursorText: null,
        selectionBackground: "#626880",
        selectionForeground: null,
        ansi: { black: "#51576d", red: "#e78284" },
      },
      window: {
        opacity: 0.92,
        paddingX: 10,
        paddingY: 10,
        decorations: "system",
      },
      cursor: { shape: "block", blink: true },
      behavior: {
        scrollbackLines: 10000,
        visualBell: false,
        attentionOnBell: false,
        copyOnSelect: false,
        middleClickPaste: true,
        confirmClose: true,
      },
    });

    expect(result.success).toBe(true);
  });

  test("rejects opacity above one", () => {
    const result = sharedConfigSchema.safeParse({
      font: {
        family: null,
        boldFamily: null,
        italicFamily: null,
        boldItalicFamily: null,
        size: null,
      },
      colors: {
        foreground: null,
        background: null,
        cursor: null,
        cursorText: null,
        selectionBackground: null,
        selectionForeground: null,
        ansi: {},
      },
      window: {
        opacity: 1.4,
        paddingX: null,
        paddingY: null,
        decorations: null,
      },
      cursor: { shape: null, blink: null },
      behavior: {
        scrollbackLines: null,
        visualBell: null,
        attentionOnBell: null,
        copyOnSelect: null,
        middleClickPaste: null,
        confirmClose: null,
      },
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npm run test -- src/domain/shared-config.test.ts
```

Expected: failure because `shared-config.ts` does not exist.

- [ ] **Step 3: Implement the shared schema**

Create `src/domain/shared-config.ts` with:

```ts
import { z } from "zod";

export const terminalIdSchema = z.enum(["ghostty", "kitty", "alacritty"]);
export type TerminalId = z.infer<typeof terminalIdSchema>;

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Expected a six-digit hex color");
const nullableHexColor = hexColorSchema.nullable();

export const ansiColorNames = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

export type AnsiColorName = (typeof ansiColorNames)[number];

export const sharedConfigSchema = z.object({
  font: z.object({
    family: z.string().min(1).nullable(),
    boldFamily: z.string().min(1).nullable(),
    italicFamily: z.string().min(1).nullable(),
    boldItalicFamily: z.string().min(1).nullable(),
    size: z.number().min(6).max(96).nullable(),
  }),
  colors: z.object({
    foreground: nullableHexColor,
    background: nullableHexColor,
    cursor: nullableHexColor,
    cursorText: nullableHexColor,
    selectionBackground: nullableHexColor,
    selectionForeground: nullableHexColor,
    ansi: z.record(z.enum(ansiColorNames), hexColorSchema).partial(),
  }),
  window: z.object({
    opacity: z.number().min(0.1).max(1).nullable(),
    paddingX: z.number().int().min(0).max(200).nullable(),
    paddingY: z.number().int().min(0).max(200).nullable(),
    decorations: z.enum(["system", "client", "none"]).nullable(),
  }),
  cursor: z.object({
    shape: z.enum(["block", "beam", "underline"]).nullable(),
    blink: z.boolean().nullable(),
  }),
  behavior: z.object({
    scrollbackLines: z.number().int().min(0).max(10_000_000).nullable(),
    visualBell: z.boolean().nullable(),
    attentionOnBell: z.boolean().nullable(),
    copyOnSelect: z.boolean().nullable(),
    middleClickPaste: z.boolean().nullable(),
    confirmClose: z.boolean().nullable(),
  }),
});

export type SharedConfig = z.infer<typeof sharedConfigSchema>;
```

- [ ] **Step 4: Implement the remaining domain contracts**

Create `src/domain/document-node.ts`:

```ts
export interface NodeBase {
  id: string;
  originalText: string;
  originalLine: number;
  modified: boolean;
}

export type DocumentNode =
  | (NodeBase & { kind: "comment" })
  | (NodeBase & { kind: "blank" })
  | (NodeBase & {
      kind: "known-setting";
      key: string;
      value: string;
      modelPath: string;
    })
  | (NodeBase & {
      kind: "unknown-setting";
      key: string;
      value: string;
    })
  | (NodeBase & { kind: "include"; target: string })
  | (NodeBase & { kind: "section"; name: string })
  | (NodeBase & { kind: "malformed"; reason: string });
```

Create `src/domain/validation.ts`:

```ts
export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  code: string;
  message: string;
  modelPath?: string;
  sourceLine?: number;
}

export interface ValidationResult {
  valid: boolean;
  nativeAvailable: boolean;
  issues: ValidationIssue[];
}
```

Create `src/domain/errors.ts`:

```ts
export type AppErrorCode =
  | "CFG_PARSE_ERROR"
  | "CFG_UNSUPPORTED_SYNTAX"
  | "PATH_NOT_FOUND"
  | "PATH_PERMISSION_DENIED"
  | "TARGET_IS_SYMLINK"
  | "BACKUP_FAILED"
  | "ATOMIC_WRITE_FAILED"
  | "READBACK_MISMATCH"
  | "NATIVE_VALIDATION_UNAVAILABLE"
  | "NATIVE_VALIDATION_FAILED"
  | "DATABASE_MIGRATION_FAILED";

export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: string;
  recoverable: boolean;
  suggestedAction?: string;
}
```

Create `src/domain/project.ts`:

```ts
import { z } from "zod";
import { sharedConfigSchema, terminalIdSchema } from "./shared-config";
import type { DocumentNode } from "./document-node";

export const terminalProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  terminal: terminalIdSchema,
  shared: sharedConfigSchema,
  overrides: z.record(z.string(), z.unknown()),
  sourcePath: z.string().nullable(),
  destinationPath: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TerminalProjectRecord = z.infer<typeof terminalProjectSchema>;

export interface TerminalProject extends TerminalProjectRecord {
  document: DocumentNode[];
  unmappedNodeIds: string[];
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- src/domain
npm run typecheck
```

Expected: tests and type checking pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain
git commit -m "feat: define portable config domain model"
```

---

### Task 3: Build the Terminal Adapter Contract and Registry

**Files:**
- Create: `src/adapters/terminal-adapter.ts`
- Create: `src/adapters/registry.ts`
- Test: `src/adapters/registry.test.ts`

**Interfaces:**
- Consumes: `TerminalId`, `SharedConfig`, `TerminalProject`, `ValidationResult`.
- Produces: `TerminalAdapter`, `ParseResult`, `GenerateResult`, `PortableExtraction`, `adapterRegistry`, and `getAdapter()`.

- [ ] **Step 1: Write the failing registry test**

```ts
import { describe, expect, test } from "vitest";
import { getAdapter, registerAdapter } from "./registry";
import type { TerminalAdapter } from "./terminal-adapter";

test("returns an adapter registered by terminal id", () => {
  const adapter = {
    terminal: "ghostty",
  } as TerminalAdapter<Record<string, unknown>>;

  registerAdapter(adapter);
  expect(getAdapter("ghostty")).toBe(adapter);
});

test("throws for an unregistered adapter", () => {
  expect(() => getAdapter("kitty")).toThrow(
    "No adapter registered for kitty",
  );
});
```

- [ ] **Step 2: Run the test to verify failure**

```bash
npm run test -- src/adapters/registry.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the adapter contract**

Create `src/adapters/terminal-adapter.ts`:

```ts
import type { DocumentNode } from "../domain/document-node";
import type { TerminalProject } from "../domain/project";
import type { SharedConfig, TerminalId } from "../domain/shared-config";
import type { ValidationResult } from "../domain/validation";

export interface ParseResult<TOverrides> {
  shared: SharedConfig;
  overrides: TOverrides;
  document: DocumentNode[];
  unmappedNodeIds: string[];
  issues: ValidationResult["issues"];
}

export interface GenerateResult {
  source: string;
  changedNodeIds: string[];
  issues: ValidationResult["issues"];
}

export interface PortableExtraction {
  shared: SharedConfig;
  omitted: Array<{
    key: string;
    reason: "terminal-specific" | "unsupported" | "invalid";
  }>;
}

export interface DetectedInstallation {
  terminal: TerminalId;
  binaryPath: string | null;
  configPaths: string[];
  version: string | null;
}

export interface NativeValidationRequest {
  terminal: TerminalId;
  binaryPath: string;
  candidatePath: string;
}

export interface TerminalAdapter<TOverrides = Record<string, unknown>> {
  readonly terminal: TerminalId;
  parse(source: string): ParseResult<TOverrides>;
  generate(project: TerminalProject): GenerateResult;
  validateInternal(project: TerminalProject): ValidationResult;
  extractPortable(project: TerminalProject): PortableExtraction;
  createOverrides(): TOverrides;
}
```

- [ ] **Step 4: Implement the registry**

Create `src/adapters/registry.ts`:

```ts
import type { TerminalId } from "../domain/shared-config";
import type { TerminalAdapter } from "./terminal-adapter";

const adapters = new Map<TerminalId, TerminalAdapter>();

export function registerAdapter(adapter: TerminalAdapter): void {
  adapters.set(adapter.terminal, adapter);
}

export function getAdapter(terminal: TerminalId): TerminalAdapter {
  const adapter = adapters.get(terminal);
  if (!adapter) {
    throw new Error(`No adapter registered for ${terminal}`);
  }
  return adapter;
}

export function clearAdaptersForTests(): void {
  adapters.clear();
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- src/adapters
npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/adapters
git commit -m "feat: add terminal adapter contract"
```

---

### Task 4: Add SQLite Migrations and Project Repositories

**Files:**
- Create: `src-tauri/migrations/0001_initial.sql`
- Create: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/db/migrations.rs`
- Create: `src-tauri/src/db/projects.rs`
- Create: `src-tauri/src/db/snapshots.rs`
- Create: `src-tauri/src/error.rs`
- Test: Rust unit tests inside repository modules

**Interfaces:**
- Produces: `Database::connect()`, `ProjectRepository::create()`, `get()`, `list()`, `update()`, `SnapshotRepository::create()`, `list_for_project()`, and `restore_payload()`.

- [ ] **Step 1: Add Rust dependencies**

In `src-tauri/Cargo.toml` add:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "migrate"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread", "fs", "process"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
tempfile = "3"
sha2 = "0.10"
hex = "0.4"
```

- [ ] **Step 2: Write the migration**

Create `src-tauri/migrations/0001_initial.sql`:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  terminal TEXT NOT NULL CHECK (terminal IN ('ghostty', 'kitty', 'alacritty')),
  payload_json TEXT NOT NULL,
  source_path TEXT,
  destination_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  label TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('automatic', 'named')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_snapshots_project_created
ON snapshots(project_id, created_at DESC);

CREATE TABLE templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  terminal TEXT NOT NULL,
  built_in INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE validation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  native_available INTEGER NOT NULL,
  valid INTEGER NOT NULL,
  issues_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE preferences (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL
);
```

- [ ] **Step 3: Write the failing project repository test**

Inside `src-tauri/src/db/projects.rs` add:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn creates_and_reads_a_project() {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        db.migrate().await.unwrap();
        let repo = ProjectRepository::new(db.pool().clone());

        let project = ProjectRow {
            id: "11111111-1111-4111-8111-111111111111".into(),
            name: "Daily Ghostty".into(),
            terminal: "ghostty".into(),
            payload_json: r#"{"version":1}"#.into(),
            source_path: None,
            destination_path: None,
            created_at: "2026-07-19T00:00:00Z".into(),
            updated_at: "2026-07-19T00:00:00Z".into(),
        };

        repo.create(&project).await.unwrap();
        let loaded = repo.get(&project.id).await.unwrap().unwrap();

        assert_eq!(loaded.name, "Daily Ghostty");
        assert_eq!(loaded.terminal, "ghostty");
    }
}
```

- [ ] **Step 4: Implement database and repository methods**

Implement:

```rust
pub struct Database {
    pool: sqlx::SqlitePool,
}

impl Database {
    pub async fn connect(url: &str) -> Result<Self, AppError>;
    pub async fn migrate(&self) -> Result<(), AppError>;
    pub fn pool(&self) -> &sqlx::SqlitePool;
}

pub struct ProjectRepository {
    pool: sqlx::SqlitePool,
}

impl ProjectRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self;
    pub async fn create(&self, row: &ProjectRow) -> Result<(), AppError>;
    pub async fn get(&self, id: &str) -> Result<Option<ProjectRow>, AppError>;
    pub async fn list(&self) -> Result<Vec<ProjectRow>, AppError>;
    pub async fn update(&self, row: &ProjectRow) -> Result<(), AppError>;
    pub async fn delete(&self, id: &str) -> Result<(), AppError>;
}
```

Use `sqlx::query_as` with bound parameters for every query.

- [ ] **Step 5: Run Rust tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml db::
```

Expected: project and snapshot repository tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri
git commit -m "feat: add project and snapshot persistence"
```

---

### Task 5: Implement the Ghostty Adapter

**Files:**
- Create: `src/adapters/ghostty/ghostty-adapter.ts`
- Create: `src/adapters/ghostty/ghostty-mappings.ts`
- Create: `src/adapters/ghostty/ghostty-parser.ts`
- Create: `src/adapters/ghostty/ghostty-writer.ts`
- Create: `fixtures/ghostty/representative.conf`
- Test: `src/adapters/ghostty/ghostty-adapter.test.ts`

**Interfaces:**
- Produces: `ghosttyAdapter`.
- Must preserve comments, blank lines, unknown settings, repeated keys, and original ordering.

- [ ] **Step 1: Add a representative fixture**

Create `fixtures/ghostty/representative.conf`:

```ini
# Jamie's daily Ghostty profile
font-family = JetBrains Mono
font-size = 13

background = #303446
foreground = #c6d0f5
background-opacity = 0.92

# Keep middle-click paste
clipboard-paste-protection = false
bell-features = no-attention

custom-future-option = keep-me
```

- [ ] **Step 2: Write the failing preservation test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ghosttyAdapter } from "./ghostty-adapter";

const source = readFileSync(
  "fixtures/ghostty/representative.conf",
  "utf8",
);

test("parses portable values and preserves unknown lines", () => {
  const parsed = ghosttyAdapter.parse(source);

  expect(parsed.shared.font.family).toBe("JetBrains Mono");
  expect(parsed.shared.window.opacity).toBe(0.92);
  expect(
    parsed.document.some(
      (node) =>
        node.kind === "unknown-setting" &&
        node.key === "custom-future-option",
    ),
  ).toBe(true);
});

test("changes one known value without losing comments", () => {
  const parsed = ghosttyAdapter.parse(source);
  const project = makeGhosttyProject(parsed);
  project.shared.font.size = 14;

  const generated = ghosttyAdapter.generate(project).source;

  expect(generated).toContain("# Jamie's daily Ghostty profile");
  expect(generated).toContain("font-size = 14");
  expect(generated).toContain("custom-future-option = keep-me");
});
```

- [ ] **Step 3: Implement line parsing**

Implement `parseGhosttyLine(line, lineNumber)` so it returns:

- `blank` for whitespace-only lines.
- `comment` for trimmed lines beginning with `#`.
- `known-setting` for mapped keys.
- `unknown-setting` for syntactically valid unrecognized keys.
- `malformed` when a non-comment line has no valid key/value separator.

Use stable IDs derived from terminal, line number, and original text hash.

- [ ] **Step 4: Implement mappings**

In `ghostty-mappings.ts`, define explicit mappings:

```ts
export const ghosttyMappings = {
  "font-family": "font.family",
  "font-size": "font.size",
  foreground: "colors.foreground",
  background: "colors.background",
  "cursor-color": "colors.cursor",
  "selection-background": "colors.selectionBackground",
  "selection-foreground": "colors.selectionForeground",
  "background-opacity": "window.opacity",
  "window-padding-x": "window.paddingX",
  "window-padding-y": "window.paddingY",
  "cursor-style": "cursor.shape",
  "cursor-style-blink": "cursor.blink",
  "scrollback-limit": "behavior.scrollbackLines",
  "bell-features": "behavior.attentionOnBell",
} as const;
```

Each mapping must also define parse and serialize transforms where native values differ from the shared model.

- [ ] **Step 5: Implement structure-preserving generation**

`ghostty-writer.ts` must:

1. Walk original nodes in order.
2. Rewrite only modified known-setting nodes.
3. Emit untouched nodes using `originalText`.
4. Append missing settings under `# Added by Config Forge`.
5. Finish with exactly one newline.

- [ ] **Step 6: Run tests**

```bash
npm run test -- src/adapters/ghostty
```

Expected: all Ghostty fixture and round-trip tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/ghostty fixtures/ghostty
git commit -m "feat: add structure-preserving Ghostty adapter"
```

---

### Task 6: Implement the Kitty Adapter

**Files:**
- Create: `src/adapters/kitty/kitty-adapter.ts`
- Create: `src/adapters/kitty/kitty-mappings.ts`
- Create: `src/adapters/kitty/kitty-parser.ts`
- Create: `src/adapters/kitty/kitty-writer.ts`
- Create: `fixtures/kitty/representative.conf`
- Test: `src/adapters/kitty/kitty-adapter.test.ts`

**Interfaces:**
- Produces: `kittyAdapter`.
- Preserves include directives and unknown Kitty directives.

- [ ] **Step 1: Add a fixture**

```conf
# Daily Kitty profile
font_family JetBrains Mono
font_size 13.0
foreground #c6d0f5
background #303446
background_opacity 0.92
cursor_shape block
scrollback_lines 10000

include themes/custom.conf
map ctrl+shift+t new_tab
future_kitty_setting keep-me
```

- [ ] **Step 2: Write failing tests**

```ts
test("parses an include as an include node", () => {
  const result = kittyAdapter.parse(source);
  expect(
    result.document.some(
      (node) =>
        node.kind === "include" &&
        node.target === "themes/custom.conf",
    ),
  ).toBe(true);
});

test("does not flatten or remove an include during generation", () => {
  const result = kittyAdapter.parse(source);
  const project = makeKittyProject(result);
  project.shared.window.opacity = 0.8;

  const generated = kittyAdapter.generate(project).source;

  expect(generated).toContain("include themes/custom.conf");
  expect(generated).toContain("background_opacity 0.8");
  expect(generated).toContain("future_kitty_setting keep-me");
});
```

- [ ] **Step 3: Implement Kitty parsing and mappings**

Map at minimum:

```ts
export const kittyMappings = {
  font_family: "font.family",
  bold_font: "font.boldFamily",
  italic_font: "font.italicFamily",
  bold_italic_font: "font.boldItalicFamily",
  font_size: "font.size",
  foreground: "colors.foreground",
  background: "colors.background",
  cursor: "colors.cursor",
  selection_background: "colors.selectionBackground",
  selection_foreground: "colors.selectionForeground",
  background_opacity: "window.opacity",
  window_padding_width: "window.paddingX",
  cursor_shape: "cursor.shape",
  cursor_blink_interval: "cursor.blink",
  scrollback_lines: "behavior.scrollbackLines",
  copy_on_select: "behavior.copyOnSelect",
  enable_audio_bell: "behavior.visualBell",
} as const;
```

Keep `map`, `mouse_map`, `include`, and unknown directives as preserved nodes unless specifically modeled.

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/adapters/kitty
```

Expected: pass, including comments, includes, and unknown settings.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/kitty fixtures/kitty
git commit -m "feat: add structure-preserving Kitty adapter"
```

---

### Task 7: Implement the Alacritty TOML Adapter

**Files:**
- Create: `src/adapters/alacritty/alacritty-adapter.ts`
- Create: `src/adapters/alacritty/alacritty-mappings.ts`
- Create: `src/adapters/alacritty/alacritty-document.ts`
- Create: `fixtures/alacritty/representative.toml`
- Test: `src/adapters/alacritty/alacritty-adapter.test.ts`

**Interfaces:**
- Produces: `alacrittyAdapter`.
- Must use a TOML document-preservation strategy and retain unknown tables and comments.

- [ ] **Step 1: Add the TOML editing dependency**

```bash
npm install @iarna/toml
```

Also evaluate a text-preserving TOML editor. If no maintained JavaScript package preserves comments reliably, implement targeted span replacement for known scalar paths while retaining the original source text. Do not serialize the full document with `JSON.stringify` or a plain TOML serializer.

- [ ] **Step 2: Add a fixture**

```toml
# Daily Alacritty profile
[font]
size = 13.0

[font.normal]
family = "JetBrains Mono"

[window]
opacity = 0.92
padding = { x = 10, y = 10 }

[colors.primary]
foreground = "#c6d0f5"
background = "#303446"

[cursor.style]
shape = "Block"
blinking = "On"

[custom.future]
keep = "me"
```

- [ ] **Step 3: Write failing round-trip tests**

```ts
test("preserves comments and unknown tables", () => {
  const parsed = alacrittyAdapter.parse(source);
  const project = makeAlacrittyProject(parsed);
  project.shared.font.size = 14;

  const generated = alacrittyAdapter.generate(project).source;

  expect(generated).toContain("# Daily Alacritty profile");
  expect(generated).toContain('[custom.future]');
  expect(generated).toContain('keep = "me"');
  expect(generated).toMatch(/size\s*=\s*14(?:\.0)?/);
});
```

- [ ] **Step 4: Implement known-path spans**

Represent known TOML assignments as nodes containing:

```ts
interface TomlKnownSettingNode extends NodeBase {
  kind: "known-setting";
  key: string;
  value: string;
  modelPath: string;
  valueStart: number;
  valueEnd: number;
}
```

Generation applies replacements from highest `valueStart` to lowest to avoid invalidating later offsets. Append missing tables and values without rewriting unrelated sections.

- [ ] **Step 5: Run tests**

```bash
npm run test -- src/adapters/alacritty
```

Expected: comments, formatting, and unknown tables survive tested edits.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/alacritty fixtures/alacritty package.json package-lock.json
git commit -m "feat: add structure-preserving Alacritty adapter"
```

---

### Task 8: Register Adapters and Build Translation Reports

**Files:**
- Modify: `src/adapters/registry.ts`
- Create: `src/domain/translation.ts`
- Create: `src/services/translation-service.ts`
- Test: `src/services/translation-service.test.ts`

**Interfaces:**
- Produces: `translateProject(source, destinationTerminal, name)`.
- Returns: `{ project, report }`.
- Translation report classifies every portable field as exact, approximate, omitted, or defaulted.

- [ ] **Step 1: Write the failing translation test**

```ts
test("translates portable Ghostty values into a new Kitty project", () => {
  const source = makeGhosttyProjectWith({
    font: { family: "JetBrains Mono", size: 13 },
    window: { opacity: 0.92 },
    behavior: { middleClickPaste: true },
  });

  const result = translateProject(source, "kitty", "Kitty Copy");

  expect(result.project.id).not.toBe(source.id);
  expect(result.project.terminal).toBe("kitty");
  expect(result.project.shared.font.family).toBe("JetBrains Mono");
  expect(result.project.shared.window.opacity).toBe(0.92);
  expect(result.report.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        modelPath: "font.family",
        status: "exact",
      }),
    ]),
  );
});
```

- [ ] **Step 2: Define translation types**

```ts
export type TranslationStatus =
  | "exact"
  | "approximate"
  | "omitted"
  | "defaulted";

export interface TranslationReportItem {
  modelPath: string;
  status: TranslationStatus;
  sourceValue: unknown;
  destinationValue: unknown;
  explanation: string;
}

export interface TranslationReport {
  sourceTerminal: TerminalId;
  destinationTerminal: TerminalId;
  items: TranslationReportItem[];
}
```

- [ ] **Step 3: Implement translation**

The service must:

1. Read only `source.shared`.
2. Query the destination adapter's supported shared paths.
3. Copy exact mappings.
4. Apply explicit approximate mappings.
5. Record omitted fields.
6. Create a new UUID.
7. Set source and destination paths to `null`.
8. Create a fresh destination document.
9. Leave the source project object unchanged.

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/services/translation-service.test.ts
```

Expected: pass for all six source/destination pairs.

- [ ] **Step 5: Commit**

```bash
git add src/domain/translation.ts src/services/translation-service.ts \
  src/services/translation-service.test.ts src/adapters/registry.ts
git commit -m "feat: add limited cross-terminal translation"
```

---

### Task 9: Implement Terminal and Config Path Detection

**Files:**
- Create: `src-tauri/src/filesystem/paths.rs`
- Create: `src-tauri/src/commands/detection.rs`
- Create: `src/services/tauri-client.ts`
- Test: Rust unit tests and TypeScript client tests

**Interfaces:**
- Produces Rust command:
  `detect_terminals() -> Result<Vec<DetectedInstallation>, AppError>`.
- Produces TypeScript function:
  `detectTerminals(): Promise<DetectedInstallation[]>`.

- [ ] **Step 1: Write failing Rust path tests**

```rust
#[test]
fn ghostty_paths_respect_xdg_config_home() {
    let env = TestEnvironment::new()
        .with("HOME", "/home/jamie")
        .with("XDG_CONFIG_HOME", "/mnt/dotfiles/config");

    let paths = candidate_config_paths(TerminalId::Ghostty, &env);

    assert_eq!(
        paths[0],
        PathBuf::from("/mnt/dotfiles/config/ghostty/config")
    );
}

#[test]
fn kitty_paths_fall_back_to_home_config() {
    let env = TestEnvironment::new().with("HOME", "/home/jamie");

    let paths = candidate_config_paths(TerminalId::Kitty, &env);

    assert_eq!(
        paths[0],
        PathBuf::from("/home/jamie/.config/kitty/kitty.conf")
    );
}
```

- [ ] **Step 2: Implement path candidates**

Define candidates for:

```text
Ghostty:
$XDG_CONFIG_HOME/ghostty/config
$HOME/.config/ghostty/config

Kitty:
$XDG_CONFIG_HOME/kitty/kitty.conf
$HOME/.config/kitty/kitty.conf

Alacritty:
$XDG_CONFIG_HOME/alacritty/alacritty.toml
$HOME/.config/alacritty/alacritty.toml
$HOME/.alacritty.toml
```

Resolve duplicates and report whether each path exists, is writable, and is a symlink.

- [ ] **Step 3: Detect binaries without a shell**

Use `std::env::split_paths(PATH)` and check executable files named:

- `ghostty`
- `kitty`
- `alacritty`

Do not call `which` through a shell.

- [ ] **Step 4: Expose the command through Tauri**

```rust
#[tauri::command]
pub async fn detect_terminals(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DetectedInstallation>, AppError> {
    detection::detect_all(&state.environment).await
}
```

- [ ] **Step 5: Add the TypeScript wrapper**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { DetectedInstallation } from "../adapters/terminal-adapter";

export async function detectTerminals(): Promise<
  DetectedInstallation[]
> {
  return invoke("detect_terminals");
}
```

- [ ] **Step 6: Run tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml filesystem::paths
npm run test -- src/services/tauri-client
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/filesystem src-tauri/src/commands/detection.rs \
  src/services/tauri-client.ts
git commit -m "feat: detect terminals and config paths"
```

---

### Task 10: Implement Backups and Atomic Writes

**Files:**
- Create: `src-tauri/src/filesystem/backup.rs`
- Create: `src-tauri/src/filesystem/atomic_write.rs`
- Create: `src-tauri/src/commands/backups.rs`
- Create: `src-tauri/src/commands/files.rs`
- Test: Rust integration tests using `tempfile`

**Interfaces:**
- Produces:
  `create_backup(target, backup_root) -> BackupRecord`.
- Produces:
  `atomic_replace(target, candidate_bytes, expected_sha256) -> WriteReceipt`.

- [ ] **Step 1: Write failure-injection tests**

```rust
#[tokio::test]
async fn failed_write_leaves_original_file_unchanged() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("config");
    tokio::fs::write(&target, b"original").await.unwrap();

    let result = atomic_replace_with_hooks(
        &target,
        b"candidate",
        AtomicWriteHooks::fail_before_rename(),
    )
    .await;

    assert!(result.is_err());
    assert_eq!(
        tokio::fs::read_to_string(&target).await.unwrap(),
        "original"
    );
}

#[tokio::test]
async fn successful_write_creates_a_matching_readback_hash() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("config");
    tokio::fs::write(&target, b"original").await.unwrap();

    let receipt = atomic_replace(&target, b"candidate").await.unwrap();

    assert_eq!(
        tokio::fs::read_to_string(&target).await.unwrap(),
        "candidate"
    );
    assert_eq!(receipt.bytes_written, 9);
}
```

- [ ] **Step 2: Implement backup naming**

Use:

```text
<backup-root>/<terminal>/<project-id>/
YYYYMMDD-HHMMSS-<original-filename>.bak
```

Write the backup first, flush it, and calculate SHA-256. Return the backup path and hash.

- [ ] **Step 3: Implement atomic replacement**

The function must:

1. Reject a missing parent directory.
2. Inspect symlinks and return `TARGET_IS_SYMLINK` unless policy explicitly permits target-following.
3. Create a temporary file in the same directory as the target.
4. Copy target permissions when the target exists.
5. Write candidate bytes.
6. Flush and call `sync_all`.
7. Rename the temporary file over the target.
8. Read the target back.
9. Compare SHA-256 with candidate SHA-256.
10. Return `READBACK_MISMATCH` on mismatch.

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml filesystem::
```

Expected: all backup, symlink, failure injection, and read-back tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/filesystem src-tauri/src/commands
git commit -m "feat: add backups and atomic config writes"
```

---

### Task 11: Implement Internal and Native Validation

**Files:**
- Create: `src/services/validation-service.ts`
- Create: `src-tauri/src/process/native_validation.rs`
- Create: `src-tauri/src/commands/validation.rs`
- Test: TypeScript and Rust tests

**Interfaces:**
- Produces:
  `validateProject(project): ValidationResult`.
- Produces Tauri command:
  `validate_candidate(request): Result<ValidationResult, AppError>`.

- [ ] **Step 1: Write internal validation tests**

```ts
test("blocks a project with an out-of-range opacity", () => {
  const project = makeValidProject();
  project.shared.window.opacity = 1.5;

  const result = validateProject(project);

  expect(result.valid).toBe(false);
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        severity: "error",
        code: "INVALID_OPACITY",
      }),
    ]),
  );
});

test("warns about malformed preserved nodes", () => {
  const project = makeValidProject();
  project.document.push({
    id: "bad-line",
    kind: "malformed",
    originalText: "font-size ???",
    originalLine: 9,
    modified: false,
    reason: "Missing key-value separator",
  });

  const result = validateProject(project);

  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        severity: "warning",
        sourceLine: 9,
      }),
    ]),
  );
});
```

- [ ] **Step 2: Implement internal validation**

Aggregate:

- Zod schema errors.
- Adapter-specific checks.
- Malformed nodes.
- Conflicting duplicate settings.
- Missing or read-only target path information supplied by Rust.
- Translation warnings.

Sort by severity, source line, and message.

- [ ] **Step 3: Define native validation command specifications**

Use a fixed allowlist:

```rust
pub struct NativeValidatorSpec {
    pub terminal: TerminalId,
    pub executable: PathBuf,
    pub args: Vec<OsString>,
    pub timeout: Duration,
}
```

Never accept an executable or arbitrary arguments directly from untrusted editor text. The backend selects the command based on the detected terminal and adapter-declared capability.

- [ ] **Step 4: Implement process execution**

Requirements:

- `tokio::process::Command`.
- `kill_on_drop(true)`.
- Five-second default timeout.
- Capture stdout and stderr.
- Limit captured output to 64 KB.
- Return `NATIVE_VALIDATION_UNAVAILABLE` when no safe validator exists.
- Return a structured validation issue for a non-zero exit.

- [ ] **Step 5: Run tests**

```bash
npm run test -- src/services/validation-service.test.ts
cargo test --manifest-path src-tauri/Cargo.toml process::
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/validation-service.ts \
  src/services/validation-service.test.ts \
  src-tauri/src/process src-tauri/src/commands/validation.rs
git commit -m "feat: add hybrid config validation"
```

---

### Task 12: Build Project, Snapshot, Template, and Apply Services

**Files:**
- Create: `src/services/project-service.ts`
- Create: `src/services/template-service.ts`
- Create: `src/services/apply-service.ts`
- Create: `src/state/project-store.ts`
- Test: service tests with mocked Tauri client

**Interfaces:**
- Produces:
  `createProject`, `importProject`, `saveProject`, `createSnapshot`,
  `restoreSnapshot`, `exportProject`, and `applyProject`.

- [x] **Step 1: Write the apply orchestration test**

```ts
test("applies in the required safety order", async () => {
  const calls: string[] = [];
  const deps = makeApplyDependencies(calls);

  await applyProject(makeValidProject(), deps);

  expect(calls).toEqual([
    "generate",
    "validate-internal",
    "validate-native",
    "diff",
    "confirm",
    "snapshot",
    "backup",
    "atomic-write",
    "verify",
  ]);
});
```

- [x] **Step 2: Define apply dependencies**

```ts
export interface ApplyDependencies {
  generate(project: TerminalProject): Promise<string>;
  validateInternal(project: TerminalProject): Promise<ValidationResult>;
  validateNative(
    project: TerminalProject,
    candidate: string,
  ): Promise<ValidationResult>;
  createDiff(current: string, candidate: string): Promise<string>;
  confirm(request: ApplyConfirmation): Promise<boolean>;
  createSnapshot(
    projectId: string,
    kind: "automatic",
    reason: string,
  ): Promise<void>;
  createBackup(request: BackupRequest): Promise<BackupRecord>;
  atomicWrite(request: AtomicWriteRequest): Promise<WriteReceipt>;
  verify(request: VerifyRequest): Promise<void>;
}
```

- [x] **Step 3: Implement apply cancellation and blocking**

`applyProject` must:

- Throw no error when the user cancels confirmation; return `{ status: "cancelled" }`.
- Stop before confirmation on validation errors.
- Keep warnings in the confirmation payload.
- Never call backup or write if diff generation fails.
- Return backup and write receipt on success.

- [x] **Step 4: Implement smart snapshots**

Automatic reasons:

- `before-import-replacement`
- `before-translation`
- `before-direct-apply`
- `before-restore`
- `before-destructive-source-reconcile`
- `before-template-replacement`

Retain all named snapshots and the latest 20 automatic snapshots per project.

- [x] **Step 5: Run tests**

```bash
npm run test -- src/services src/state
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add src/services src/state
git commit -m "feat: add project history and safe apply orchestration"
```

---

### Task 13: Build the Home Screen and Split Studio Shell

**Files:**
- Modify: `src/app/App.tsx`
- Create: `src/app/routes.tsx`
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/components/layout/HomeScreen.tsx`
- Create: `src/components/layout/SplitStudio.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/app.css`
- Test: component tests

**Interfaces:**
- Consumes project store and services.
- Produces home workflows and the main editor layout.

- [x] **Step 1: Write the home screen test**

```tsx
test("offers equal create and import actions", () => {
  render(<HomeScreen />);

  expect(
    screen.getByRole("button", { name: "Create New Config" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Import Existing Config" }),
  ).toBeVisible();
});
```

- [x] **Step 2: Implement design tokens**

Create semantic tokens for:

```css
:root {
  --bg-app: #f4f4f5;
  --bg-panel: #ffffff;
  --bg-elevated: #fafafa;
  --text-primary: #18181b;
  --text-secondary: #52525b;
  --border: #d4d4d8;
  --accent: #d97706;
  --accent-contrast: #ffffff;
  --danger: #b91c1c;
  --warning: #a16207;
  --success: #15803d;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
}

[data-theme="dark"] {
  --bg-app: #18181b;
  --bg-panel: #232326;
  --bg-elevated: #2b2b2f;
  --text-primary: #f4f4f5;
  --text-secondary: #a1a1aa;
  --border: #3f3f46;
  --accent: #f59e0b;
  --accent-contrast: #18181b;
  --danger: #f87171;
  --warning: #fbbf24;
  --success: #4ade80;
}
```

- [x] **Step 3: Implement the home screen**

Include:

- Create New Config.
- Import Existing Config.
- Recent projects.
- Detected terminals.
- Built-in templates.
- Empty-state copy.
- Keyboard-accessible cards implemented as buttons or links.

- [x] **Step 4: Implement Split Studio**

Desktop layout:

```text
Project sidebar | Visual controls | Preview/source workspace
```

Narrow layout:

```text
Project header
Tabbed controls / Preview / Source / Validation
Sticky action bar
```

Do not require horizontal scrolling at 320 CSS pixels.

- [x] **Step 5: Run component tests**

```bash
npm run test -- src/components/layout
npm run typecheck
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add src/app src/components/layout src/styles
git commit -m "feat: build Modern Forge application shell"
```

---

### Task 14: Build Visual Controls and Mock Terminal Preview

**Files:**
- Create: `src/components/editor/AppearanceControls.tsx`
- Create: `src/components/editor/FontControls.tsx`
- Create: `src/components/editor/ColorControls.tsx`
- Create: `src/components/editor/BehaviorControls.tsx`
- Create: `src/components/editor/TerminalOverrides.tsx`
- Create: `src/components/preview/TerminalPreview.tsx`
- Create: `src/components/preview/preview-model.ts`
- Test: component and pure-model tests

**Interfaces:**
- Produces controlled editors that update `SharedConfig`.
- Produces `buildPreviewModel(sharedConfig)`.

- [ ] **Step 1: Write a preview-model test**

```ts
test("turns shared colors and spacing into preview values", () => {
  const model = buildPreviewModel(
    makeSharedConfig({
      colors: {
        foreground: "#c6d0f5",
        background: "#303446",
        cursor: "#f2d5cf",
      },
      window: {
        opacity: 0.92,
        paddingX: 10,
        paddingY: 12,
      },
    }),
  );

  expect(model.style).toMatchObject({
    color: "#c6d0f5",
    backgroundColor: "#303446",
    opacity: 0.92,
    paddingInline: "10px",
    paddingBlock: "12px",
  });
});
```

- [ ] **Step 2: Implement field controls**

Each control must:

- Have a visible label.
- Display native terminal mapping help.
- Validate on change.
- Support reset-to-inherited.
- Display translated portability status.
- Update only its assigned shared-model path.
- Avoid writing directly to generated source.

- [ ] **Step 3: Implement the mock terminal**

Display:

- Shell prompt.
- Git branch.
- ANSI color row.
- Bold, italic, and selected text.
- Block, beam, or underline cursor.
- Tab strip.
- Scrollback sample.
- Padding and opacity.
- Day-to-day command examples without executing anything.

Use CSS variables derived from `PreviewModel`, not arbitrary inline parsing of config source.

- [ ] **Step 4: Add reduced-motion handling**

Blinking cursor must stop when:

```css
@media (prefers-reduced-motion: reduce) {
  .preview-cursor {
    animation: none;
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test -- src/components/editor src/components/preview
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor src/components/preview
git commit -m "feat: add visual config controls and preview"
```

---

### Task 15: Add Advanced Source, Diff, Validation, and Unmapped Panels

**Files:**
- Create: `src/components/editor/AdvancedSource.tsx`
- Create: `src/components/editor/source-reconcile.ts`
- Create: `src/components/editor/DiffViewer.tsx`
- Create: `src/components/validation/ValidationPanel.tsx`
- Create: `src/components/editor/UnmappedSettings.tsx`
- Test: reconciliation and component tests

**Interfaces:**
- Produces `reconcileSourceEdit(project, editedSource)`.
- Produces UI panels for generated source, native source editing, diff, validation, and unmapped nodes.

- [ ] **Step 1: Write a reconciliation test**

```ts
test("maps a recognized source edit back into shared settings", () => {
  const project = makeGhosttyProject();
  const result = reconcileSourceEdit(
    project,
    "font-family = Iosevka\nfont-size = 14\n",
  );

  expect(result.project.shared.font.family).toBe("Iosevka");
  expect(result.project.shared.font.size).toBe(14);
  expect(result.requiresConfirmation).toBe(false);
});

test("warns when a raw edit introduces an unknown setting", () => {
  const project = makeGhosttyProject();
  const result = reconcileSourceEdit(
    project,
    "font-family = Iosevka\nexperimental-option = yes\n",
  );

  expect(result.requiresConfirmation).toBe(true);
  expect(result.unmappedAdded).toHaveLength(1);
});
```

- [ ] **Step 2: Implement CodeMirror source editor**

Requirements:

- Native config text.
- Unsaved-change marker.
- Parse after 400 ms debounce.
- Preserve editor text after parse errors.
- Show source-line diagnostics.
- Require confirmation when edits cannot round-trip.
- Provide **Revert to Generated Source**.

- [ ] **Step 3: Implement diff viewer**

Display:

- Current live config vs candidate.
- Added, removed, and unchanged lines.
- Backup destination.
- Symlink behavior.
- Blocking validation errors.
- Confirmation checkbox stating the user reviewed the diff.

- [ ] **Step 4: Implement validation and unmapped panels**

Validation grouping:

- Errors.
- Warnings.
- Information.

Unmapped grouping:

- Terminal-specific.
- Unknown.
- Malformed.
- Include/directive.
- Translation-only warning.

- [ ] **Step 5: Run tests**

```bash
npm run test -- src/components/editor src/components/validation
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor src/components/validation
git commit -m "feat: add source editing diffs and diagnostics"
```

---

### Task 16: Add Built-In and Personal Templates

**Files:**
- Create: `src/templates/builtins.ts`
- Create: `src/services/template-service.ts`
- Create: `src-tauri/src/db/templates.rs`
- Create: `src/components/layout/TemplatePicker.tsx`
- Test: template service and repository tests

**Interfaces:**
- Produces immutable built-ins and CRUD operations for personal templates.

- [ ] **Step 1: Write template tests**

```ts
test("cannot overwrite a built-in template", async () => {
  const service = makeTemplateService();

  await expect(
    service.update("builtin-modern-dark", {
      name: "Changed",
    }),
  ).rejects.toMatchObject({
    code: "BUILTIN_TEMPLATE_IMMUTABLE",
  });
});

test("duplicates a built-in as a personal template", async () => {
  const service = makeTemplateService();
  const copy = await service.duplicate(
    "builtin-modern-dark",
    "My Modern Dark",
  );

  expect(copy.builtIn).toBe(false);
  expect(copy.name).toBe("My Modern Dark");
});
```

- [ ] **Step 2: Define built-in template shape**

```ts
export interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  terminal: TerminalId | "portable";
  builtIn: boolean;
  shared: SharedConfig;
  overrides: Record<string, unknown>;
  attribution?: {
    name: string;
    license: string;
    url: string;
  };
}
```

- [ ] **Step 3: Add original safe starter templates**

Implement first-party templates:

- Blank.
- Modern Dark.
- Modern Light.
- High Contrast Dark.
- High Contrast Light.
- Retro Green.
- Presentation.
- Minimal.

Do not include third-party-derived palettes until license and attribution review is complete.

- [ ] **Step 4: Implement personal template persistence**

Support:

- Create from project.
- Duplicate.
- Rename.
- Delete.
- List by terminal.
- Export JSON bundle.
- Import validated JSON bundle.

- [ ] **Step 5: Run tests**

```bash
npm run test -- src/services/template-service.test.ts \
  src/components/layout/TemplatePicker.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml db::templates
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/templates src/services/template-service.ts \
  src-tauri/src/db/templates.rs src/components/layout/TemplatePicker.tsx
git commit -m "feat: add local config templates"
```

---

### Task 17: Wire Tauri Commands and Application Startup

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/main.rs`
- Create: `src/app/startup.ts`
- Modify: `src/app/App.tsx`
- Test: startup tests and Rust command registration smoke test

**Interfaces:**
- Produces initialized app state, database migrations, command registration, and frontend startup data.

- [ ] **Step 1: Define Rust app state**

```rust
pub struct AppState {
    pub database: Database,
    pub data_dir: PathBuf,
    pub backup_dir: PathBuf,
    pub export_dir: PathBuf,
}
```

- [ ] **Step 2: Initialize state**

At startup:

1. Resolve Tauri app data directory.
2. Create required directories.
3. Open SQLite with WAL mode.
4. Run migrations.
5. Register plugins.
6. Register commands.
7. Store `AppState`.

On migration failure, show a blocking startup error and do not continue with a partially initialized database.

- [ ] **Step 3: Register commands**

Register at minimum:

```rust
tauri::generate_handler![
    commands::detection::detect_terminals,
    commands::projects::create_project,
    commands::projects::get_project,
    commands::projects::list_projects,
    commands::projects::save_project,
    commands::backups::create_backup,
    commands::files::read_text_file,
    commands::files::export_config,
    commands::files::apply_config,
    commands::validation::validate_candidate,
]
```

- [ ] **Step 4: Implement frontend startup**

```ts
export interface StartupData {
  detectedTerminals: DetectedInstallation[];
  recentProjects: TerminalProjectRecord[];
  templates: ConfigTemplate[];
}

export async function loadStartupData(): Promise<StartupData> {
  const [detectedTerminals, recentProjects, templates] =
    await Promise.all([
      detectTerminals(),
      listProjects(),
      listTemplates(),
    ]);

  return { detectedTerminals, recentProjects, templates };
}
```

Use a recoverable partial-startup state when detection fails but the database remains available.

- [ ] **Step 5: Run verification**

```bash
npm run test
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

Expected: the app opens, migrations run, and the home screen shows detection results.

- [ ] **Step 6: Commit**

```bash
git add src src-tauri
git commit -m "feat: connect frontend to Tauri services"
```

---

### Task 18: Add End-to-End Safety and Workflow Tests

**Files:**
- Create: `tests/e2e/create-project.spec.ts`
- Create: `tests/e2e/import-config.spec.ts`
- Create: `tests/e2e/translate-project.spec.ts`
- Create: `tests/e2e/safe-apply.spec.ts`
- Create: `playwright.config.ts`
- Create: `src-tauri/tests/safe_apply.rs`

**Interfaces:**
- Produces automated evidence for the MVP acceptance criteria.

- [ ] **Step 1: Configure Playwright**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    port: 1420,
    reuseExistingServer: !process.env.CI,
  },
});
```

Use a mock Tauri client for browser-only UI flows. Keep privileged write verification in Rust integration tests.

- [ ] **Step 2: Test new-project flow**

```ts
test("creates a Ghostty project from a built-in template", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", {
    name: "Create New Config",
  }).click();
  await page.getByLabel("Terminal").selectOption("ghostty");
  await page.getByLabel("Template").selectOption("modern-dark");
  await page.getByLabel("Project name").fill("Daily Ghostty");
  await page.getByRole("button", { name: "Create Project" }).click();

  await expect(
    page.getByRole("heading", { name: "Daily Ghostty" }),
  ).toBeVisible();
  await expect(page.getByText("Ghostty")).toBeVisible();
});
```

- [ ] **Step 3: Test import preservation**

Import each fixture, change one recognized setting, and assert that comments and unknown settings remain in generated source.

- [ ] **Step 4: Test translation**

Translate a Ghostty fixture to Kitty and assert:

- New project ID.
- Source project unchanged.
- Portable values copied.
- Unsupported values listed in the report.

- [ ] **Step 5: Test safe apply in Rust**

The Rust integration test must verify:

- Backup created before replacement.
- Original content retained after injected failure.
- Successful candidate hash matches read-back hash.
- Symlink target policy blocks ambiguous replacement.
- No shell invocation occurs.

- [ ] **Step 6: Run all tests**

```bash
npm run test
npm run test:e2e
npm run typecheck
npm run lint
npm run format:check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all commands pass.

- [ ] **Step 7: Commit**

```bash
git add tests playwright.config.ts src-tauri/tests
git commit -m "test: cover Config Forge core workflows"
```

---

### Task 19: Package the Linux MVP and Write Operator Documentation

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `README.md`
- Create: `docs/architecture.md`
- Create: `docs/adapter-authoring.md`
- Create: `docs/recovery.md`
- Create: `CHANGELOG.md`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces AppImage and Debian package artifacts plus contributor and recovery documentation.

- [ ] **Step 1: Configure bundles**

Set Tauri bundle targets to:

```json
{
  "bundle": {
    "active": true,
    "targets": ["appimage", "deb"],
    "category": "Development",
    "shortDescription": "Visual terminal configuration studio",
    "longDescription": "Create, import, preview, validate, translate, back up, and safely apply Ghostty, Kitty, and Alacritty configurations."
  }
}
```

- [ ] **Step 2: Document installation and safety model**

README sections:

- What Config Forge does.
- Supported terminals.
- Linux prerequisites.
- Development setup.
- Running tests.
- Building packages.
- Local-only privacy behavior.
- Backup location.
- Recovery steps.
- Known limitations.
- License.

- [ ] **Step 3: Document adapter authoring**

`docs/adapter-authoring.md` must define:

- Adapter contract.
- Portable mapping table.
- Parser node requirements.
- Structure-preservation fixtures.
- Internal validation rules.
- Native validation safety rules.
- Required tests for a new adapter.

- [ ] **Step 4: Add CI**

CI jobs:

1. Frontend formatting, linting, type checking, and Vitest.
2. Rust formatting, Clippy, and tests.
3. Production web build.
4. Tauri Linux bundle build on a supported Ubuntu runner.
5. Upload AppImage and Debian artifacts for tagged releases.

- [ ] **Step 5: Build release candidates**

```bash
npm ci
npm run test
npm run build
npm run tauri build -- --bundles appimage,deb
```

Expected artifacts under:

```text
src-tauri/target/release/bundle/appimage/
src-tauri/target/release/bundle/deb/
```

- [ ] **Step 6: Perform release smoke tests**

On a clean Linux test account:

1. Install or run the package.
2. Create a project.
3. Import one fixture for each terminal.
4. Export to a temporary directory.
5. Apply to a disposable config path.
6. Restore a snapshot.
7. Confirm the app performs no network request during normal use.
8. Confirm uninstalling does not delete user backups without explicit action.

- [ ] **Step 7: Commit**

```bash
git add README.md docs CHANGELOG.md THIRD_PARTY_NOTICES.md \
  .github/workflows/ci.yml src-tauri/tauri.conf.json
git commit -m "docs: package and document Config Forge v1"
```

---

## Final Verification Checklist

- [ ] `npm ci` completes.
- [ ] `npm run test` passes.
- [ ] `npm run test:e2e` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run format:check` passes.
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passes.
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` passes.
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes.
- [ ] Ghostty fixture round trips preserve comments and unknown settings.
- [ ] Kitty fixture round trips preserve includes and unknown settings.
- [ ] Alacritty fixture round trips preserve comments and unknown tables.
- [ ] Translation produces new projects and complete reports.
- [ ] Direct apply cannot proceed with blocking internal errors.
- [ ] Direct apply always creates both a snapshot and backup.
- [ ] Failure injection never damages the original config.
- [ ] Symlink behavior is explicit and tested.
- [ ] AppImage and Debian artifacts build successfully.
- [ ] The packaged application performs normal workflows without internet access.

---

## Recommended Delivery Milestones

### Milestone 1: Domain and persistence foundation

Tasks 1 through 4.

Deliverable: launchable desktop shell, typed project model, adapter contract, and SQLite persistence.

### Milestone 2: Terminal format engine

Tasks 5 through 8.

Deliverable: three tested adapters plus limited cross-terminal translation.

### Milestone 3: Safe desktop integration

Tasks 9 through 12.

Deliverable: detection, validation, backups, atomic writes, history, and apply orchestration.

### Milestone 4: Split Studio experience

Tasks 13 through 16.

Deliverable: polished visual editor, preview, advanced source, diagnostics, diffs, and templates.

### Milestone 5: Integration and release

Tasks 17 through 19.

Deliverable: fully wired Tauri application, workflow tests, documentation, AppImage, and Debian package.

---

## Primary Reference Documentation

- Tauri 2 prerequisites: `https://v2.tauri.app/start/prerequisites/`
- Tauri project creation: `https://v2.tauri.app/start/create-project/`
- React with TypeScript: `https://react.dev/learn/typescript`
- Vitest guide: `https://vitest.dev/guide/`
- Playwright documentation: `https://playwright.dev/docs/intro`
- Rust book: `https://doc.rust-lang.org/book/`
- SQLx documentation: `https://docs.rs/sqlx/`
