# Config Forge SQLite Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Task 4 of the v1 roadmap by adding migrated SQLite storage and tested project and snapshot repositories.

**Architecture:** Keep persistence in focused Rust modules under `src-tauri/src/db`. SQLite stores each TypeScript `TerminalProject` as an opaque, versioned JSON payload while retaining indexed project metadata in columns; repository methods use bound SQLx queries, and migrations are embedded into the binary. This plan supplements only Task 4 of `docs/config-forge-implementation-plan.md`; Tauri managed state and frontend commands remain deferred to Task 17.

**Tech Stack:** Rust stable, SQLx 0.8, SQLite, Tokio, `thiserror`, Tauri 2, Cargo tests

## Global Constraints

- Preserve the existing Task 4 schema and public repository boundaries.
- Keep Config Forge local-only and usable without network access at runtime.
- Store projects and history in SQLite; keep imports, exports, and backups as ordinary files.
- Use bound parameters for every value-bearing SQL statement.
- Enable SQLite foreign-key enforcement and verify project deletion cascades to snapshots.
- Use one connection for `sqlite::memory:` tests so every query sees the same in-memory database.
- Do not register Tauri commands, plugins, or managed application state in this milestone.
- Finish Task 4 as the final slice of Milestone 1 before starting the Ghostty adapter.

---

## File Structure

- Modify: `src-tauri/Cargo.toml` - persistence and future desktop-integration dependencies already assigned to Task 4.
- Create: `src-tauri/migrations/0001_initial.sql` - the complete v1 database schema.
- Create: `src-tauri/src/error.rs` - Rust-side database and migration errors.
- Create: `src-tauri/src/db/mod.rs` - pool ownership, connection setup, and module exports.
- Create: `src-tauri/src/db/migrations.rs` - embedded migration runner.
- Create: `src-tauri/src/db/projects.rs` - project row model and CRUD repository.
- Create: `src-tauri/src/db/snapshots.rs` - snapshot row model, history queries, and payload restoration.
- Modify: `src-tauri/src/lib.rs` - expose the database and error modules without initializing application state.

### Task 1: Establish the SQLite Database and Migration Boundary

**Files:**

- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/migrations/0001_initial.sql`
- Create: `src-tauri/src/error.rs`
- Create: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/db/migrations.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**

- Produces: `Database::connect(url: &str)`, `Database::migrate()`, `Database::pool()`, and `AppError`.
- Consumes: no frontend or Tauri command APIs.

- [ ] **Step 1: Add the Task 4 Rust dependencies**

Add the following entries under `[dependencies]` in `src-tauri/Cargo.toml`, retaining the existing Tauri and Serde entries:

```toml
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-shell = "2"
thiserror = "2"
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "migrate", "macros"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread", "fs", "process"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
tempfile = "3"
sha2 = "0.10"
hex = "0.4"
```

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: Cargo resolves SQLx with SQLite, Tokio, migrations, and derive macros enabled.

- [ ] **Step 2: Write the initial migration**

Create `src-tauri/migrations/0001_initial.sql` with the five roadmap tables and snapshot index:

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

- [ ] **Step 3: Define explicit persistence errors**

Create `src-tauri/src/error.rs`:

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database operation failed: {0}")]
    Database(#[from] sqlx::Error),
    #[error("database migration failed: {0}")]
    DatabaseMigration(#[from] sqlx::migrate::MigrateError),
}
```

- [ ] **Step 4: Write the failing database migration test**

In `src-tauri/src/db/mod.rs`, add a test that connects to one in-memory database, runs migrations, and proves the expected tables exist:

```rust
#[cfg(test)]
mod tests {
    use super::Database;

    #[tokio::test]
    async fn migrates_the_initial_schema() {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database.migrate().await.unwrap();

        let tables: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .fetch_all(database.pool())
        .await
        .unwrap();

        for expected in [
            "projects",
            "snapshots",
            "templates",
            "validation_runs",
            "preferences",
        ] {
            assert!(tables.iter().any(|table| table == expected));
        }
    }
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml migrates_the_initial_schema`

Expected: FAIL because `Database` and the migration runner do not exist yet.

- [ ] **Step 5: Implement connection and migration ownership**

Create `src-tauri/src/db/migrations.rs`:

```rust
use sqlx::{migrate::Migrator, SqlitePool};

use crate::error::AppError;

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

pub async fn run(pool: &SqlitePool) -> Result<(), AppError> {
    MIGRATOR.run(pool).await?;
    Ok(())
}
```

Implement `src-tauri/src/db/mod.rs` so in-memory tests cannot split across multiple SQLite databases:

```rust
mod migrations;
pub mod projects;
pub mod snapshots;

use std::str::FromStr;

use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

use crate::error::AppError;

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn connect(url: &str) -> Result<Self, AppError> {
        let in_memory = url == "sqlite::memory:";
        let max_connections = if in_memory { 1 } else { 5 };
        let options = sqlx::sqlite::SqliteConnectOptions::from_str(url)?
            .create_if_missing(!in_memory)
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(max_connections)
            .connect_with(options)
            .await?;

        Ok(Self { pool })
    }

    pub async fn migrate(&self) -> Result<(), AppError> {
        migrations::run(&self.pool).await
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}
```

Expose the modules at the top of `src-tauri/src/lib.rs`:

```rust
pub mod db;
pub mod error;
```

- [ ] **Step 6: Verify the migration boundary**

Run: `cargo test --manifest-path src-tauri/Cargo.toml migrates_the_initial_schema`

Expected: PASS with the five application tables present.

### Task 2: Implement the Project Repository

**Files:**

- Create: `src-tauri/src/db/projects.rs`

**Interfaces:**

- Consumes: `Database::pool()` and `AppError`.
- Produces: `ProjectRow`, `ProjectRepository::new`, `create`, `get`, `list`, `update`, and `delete`.

- [ ] **Step 1: Write repository lifecycle tests**

Add this test module in `src-tauri/src/db/projects.rs` so every case starts from a migrated in-memory database:

```rust
#[cfg(test)]
mod tests {
    use super::{ProjectRepository, ProjectRow};
    use crate::{db::Database, error::AppError};

    fn project_fixture() -> ProjectRow {
        ProjectRow {
            id: "11111111-1111-4111-8111-111111111111".into(),
            name: "Daily Ghostty".into(),
            terminal: "ghostty".into(),
            payload_json: r#"{"version":1}"#.into(),
            source_path: None,
            destination_path: Some("/home/test/.config/ghostty/config".into()),
            created_at: "2026-08-09T00:00:00Z".into(),
            updated_at: "2026-08-09T00:00:00Z".into(),
        }
    }

    async fn repository() -> ProjectRepository {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database.migrate().await.unwrap();
        ProjectRepository::new(database.pool().clone())
    }

    #[tokio::test]
    async fn creates_updates_lists_and_deletes_a_project() {
        let repository = repository().await;
        let mut project = project_fixture();

        repository.create(&project).await.unwrap();
        assert_eq!(
            repository.get(&project.id).await.unwrap(),
            Some(project.clone())
        );

        project.name = "Updated Ghostty".into();
        project.updated_at = "2026-08-09T01:00:00Z".into();
        repository.update(&project).await.unwrap();
        assert_eq!(repository.list().await.unwrap(), vec![project.clone()]);

        repository.delete(&project.id).await.unwrap();
        assert_eq!(repository.get(&project.id).await.unwrap(), None);
    }
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml db::projects`

Expected: FAIL because the row and repository are not implemented.

- [ ] **Step 2: Define the row and repository types**

Use SQLx row derivation and keep the JSON payload opaque at the Rust repository boundary. Add the imports, types, and constructor below:

```rust
use sqlx::SqlitePool;

use crate::error::AppError;

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub terminal: String,
    pub payload_json: String,
    pub source_path: Option<String>,
    pub destination_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone)]
pub struct ProjectRepository {
    pool: SqlitePool,
}

impl ProjectRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}
```

- [ ] **Step 3: Implement project CRUD with bound queries**

Add these methods inside `impl ProjectRepository`:

```rust
pub async fn create(&self, row: &ProjectRow) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO projects \
         (id, name, terminal, payload_json, source_path, destination_path, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&row.id)
    .bind(&row.name)
    .bind(&row.terminal)
    .bind(&row.payload_json)
    .bind(&row.source_path)
    .bind(&row.destination_path)
    .bind(&row.created_at)
    .bind(&row.updated_at)
    .execute(&self.pool)
    .await?;

    Ok(())
}

pub async fn get(&self, id: &str) -> Result<Option<ProjectRow>, AppError> {
    let row = sqlx::query_as::<_, ProjectRow>(
        "SELECT id, name, terminal, payload_json, source_path, destination_path, \
         created_at, updated_at FROM projects WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&self.pool)
    .await?;

    Ok(row)
}

pub async fn list(&self) -> Result<Vec<ProjectRow>, AppError> {
    let rows = sqlx::query_as::<_, ProjectRow>(
        "SELECT id, name, terminal, payload_json, source_path, destination_path, \
         created_at, updated_at FROM projects ORDER BY updated_at DESC, id ASC",
    )
    .fetch_all(&self.pool)
    .await?;

    Ok(rows)
}

pub async fn update(&self, row: &ProjectRow) -> Result<(), AppError> {
    let result = sqlx::query(
        "UPDATE projects SET name = ?, terminal = ?, payload_json = ?, source_path = ?, \
         destination_path = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&row.name)
    .bind(&row.terminal)
    .bind(&row.payload_json)
    .bind(&row.source_path)
    .bind(&row.destination_path)
    .bind(&row.updated_at)
    .bind(&row.id)
    .execute(&self.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound {
            entity: "project",
            id: row.id.clone(),
        });
    }

    Ok(())
}

pub async fn delete(&self, id: &str) -> Result<(), AppError> {
    let result = sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(id)
        .execute(&self.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound {
            entity: "project",
            id: id.to_owned(),
        });
    }

    Ok(())
}
```

Add this explicit not-found variant to `AppError`:

```rust
#[error("{entity} not found: {id}")]
NotFound { entity: &'static str, id: String },
```

- [ ] **Step 4: Verify project lifecycle and constraints**

Add these tests inside the existing `tests` module:

```rust
#[tokio::test]
async fn enforces_ids_terminals_and_missing_updates() {
    let repository = repository().await;
    let project = project_fixture();
    repository.create(&project).await.unwrap();

    assert!(repository.create(&project).await.is_err());

    let mut invalid_terminal = project.clone();
    invalid_terminal.id = "22222222-2222-4222-8222-222222222222".into();
    invalid_terminal.terminal = "wezterm".into();
    assert!(repository.create(&invalid_terminal).await.is_err());

    let mut missing_project = project;
    missing_project.id = "33333333-3333-4333-8333-333333333333".into();
    assert!(matches!(
        repository.update(&missing_project).await,
        Err(AppError::NotFound {
            entity: "project",
            ..
        })
    ));
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml db::projects`

Expected: PASS for lifecycle, duplicate ID, terminal constraint, and missing-row behavior.

### Task 3: Implement Snapshot History and Restore Payloads

**Files:**

- Create: `src-tauri/src/db/snapshots.rs`
- Test: unit tests in `src-tauri/src/db/snapshots.rs`

**Interfaces:**

- Consumes: a persisted project ID and `Database::pool()`.
- Produces: `SnapshotRow`, `SnapshotRepository::new`, `create`, `list_for_project`, and `restore_payload`.

- [ ] **Step 1: Write failing snapshot behavior tests**

Add this test module with complete project and snapshot fixtures:

```rust
#[cfg(test)]
mod tests {
    use super::{SnapshotRepository, SnapshotRow};
    use crate::db::{
        projects::{ProjectRepository, ProjectRow},
        Database,
    };

    fn project_fixture() -> ProjectRow {
        ProjectRow {
            id: "11111111-1111-4111-8111-111111111111".into(),
            name: "Daily Ghostty".into(),
            terminal: "ghostty".into(),
            payload_json: r#"{"version":1}"#.into(),
            source_path: None,
            destination_path: None,
            created_at: "2026-08-09T00:00:00Z".into(),
            updated_at: "2026-08-09T00:00:00Z".into(),
        }
    }

    fn snapshot_fixture(project_id: &str, id: &str, created_at: &str) -> SnapshotRow {
        SnapshotRow {
            id: id.into(),
            project_id: project_id.into(),
            label: None,
            kind: "automatic".into(),
            payload_json: format!(r#"{{"version":1,"snapshot":"{id}"}}"#),
            created_at: created_at.into(),
        }
    }

    async fn database_with_project() -> (Database, ProjectRow) {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database.migrate().await.unwrap();
        let project = project_fixture();
        ProjectRepository::new(database.pool().clone())
            .create(&project)
            .await
            .unwrap();
        (database, project)
    }

    #[tokio::test]
    async fn stores_lists_and_restores_snapshot_payloads() {
        let (database, project) = database_with_project().await;
        let repository = SnapshotRepository::new(database.pool().clone());
        let older = snapshot_fixture(&project.id, "snapshot-1", "2026-08-09T00:00:00Z");
        let newer = snapshot_fixture(&project.id, "snapshot-2", "2026-08-09T01:00:00Z");

        repository.create(&older).await.unwrap();
        repository.create(&newer).await.unwrap();

        assert_eq!(
            repository.list_for_project(&project.id).await.unwrap(),
            vec![newer.clone(), older]
        );
        assert_eq!(
            repository.restore_payload(&newer.id).await.unwrap(),
            Some(newer.payload_json)
        );
        assert_eq!(repository.restore_payload("missing").await.unwrap(), None);
    }
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml db::snapshots`

Expected: FAIL because the snapshot repository does not exist.

- [ ] **Step 2: Define snapshot persistence types**

```rust
use sqlx::SqlitePool;

use crate::error::AppError;

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct SnapshotRow {
    pub id: String,
    pub project_id: String,
    pub label: Option<String>,
    pub kind: String,
    pub payload_json: String,
    pub created_at: String,
}

#[derive(Clone)]
pub struct SnapshotRepository {
    pool: SqlitePool,
}
```

- [ ] **Step 3: Implement snapshot queries**

Add this implementation:

```rust
impl SnapshotRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, row: &SnapshotRow) -> Result<(), AppError> {
        sqlx::query(
            "INSERT INTO snapshots (id, project_id, label, kind, payload_json, created_at) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&row.id)
        .bind(&row.project_id)
        .bind(&row.label)
        .bind(&row.kind)
        .bind(&row.payload_json)
        .bind(&row.created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_for_project(
        &self,
        project_id: &str,
    ) -> Result<Vec<SnapshotRow>, AppError> {
        let rows = sqlx::query_as::<_, SnapshotRow>(
            "SELECT id, project_id, label, kind, payload_json, created_at FROM snapshots \
             WHERE project_id = ? ORDER BY created_at DESC, id ASC",
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    pub async fn restore_payload(
        &self,
        snapshot_id: &str,
    ) -> Result<Option<String>, AppError> {
        let payload = sqlx::query_scalar("SELECT payload_json FROM snapshots WHERE id = ?")
            .bind(snapshot_id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(payload)
    }
}
```

- [ ] **Step 4: Verify history integrity**

Add this integrity test inside the existing `tests` module:

```rust
#[tokio::test]
async fn enforces_snapshot_constraints_and_project_cascade() {
    let (database, project) = database_with_project().await;
    let snapshot_repository = SnapshotRepository::new(database.pool().clone());
    let project_repository = ProjectRepository::new(database.pool().clone());
    let valid = snapshot_fixture(&project.id, "snapshot-1", "2026-08-09T00:00:00Z");
    snapshot_repository.create(&valid).await.unwrap();

    let mut invalid_kind = snapshot_fixture(
        &project.id,
        "snapshot-2",
        "2026-08-09T01:00:00Z",
    );
    invalid_kind.kind = "manual".into();
    assert!(snapshot_repository.create(&invalid_kind).await.is_err());

    let missing_project = snapshot_fixture(
        "99999999-9999-4999-8999-999999999999",
        "snapshot-3",
        "2026-08-09T02:00:00Z",
    );
    assert!(snapshot_repository.create(&missing_project).await.is_err());

    project_repository.delete(&project.id).await.unwrap();
    assert!(snapshot_repository
        .list_for_project(&project.id)
        .await
        .unwrap()
        .is_empty());
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml db::snapshots`

Expected: PASS, including the cascade proof.

### Task 4: Close Milestone 1 With Full Verification

**Files:**

- Modify only if verification finds an in-scope defect in Task 4 files.

**Interfaces:**

- Consumes: all Task 1-4 code.
- Produces: a clean, independently verified Milestone 1 persistence boundary.

- [ ] **Step 1: Run Rust formatting and static analysis**

Run:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Expected: both commands exit with status 0 and no warnings.

- [ ] **Step 2: Run repository tests and builds**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Expected: Rust repository tests, 12 existing frontend tests, and desktop/mobile shell smoke tests all pass.

- [ ] **Step 3: Check the final patch**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the Task 4 persistence files are changed.

- [ ] **Step 4: Commit the completed roadmap task**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock \
  src-tauri/migrations src-tauri/src/db src-tauri/src/error.rs \
  src-tauri/src/lib.rs
git commit -m "feat: add project and snapshot persistence"
```

Expected: one verified Task 4 commit completes Milestone 1. Task 5, the Ghostty adapter, is the next roadmap boundary.
