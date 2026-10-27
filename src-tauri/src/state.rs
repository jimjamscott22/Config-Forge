use std::path::{Path, PathBuf};

use crate::db::Database;
use crate::error::AppError;
use crate::filesystem::paths::Environment;

pub struct AppState {
    pub environment: Box<dyn Environment>,
    pub database: Database,
    pub data_dir: PathBuf,
    pub backup_dir: PathBuf,
    pub export_dir: PathBuf,
}

impl AppState {
    /// Creates the data directories, opens the SQLite database in WAL mode,
    /// and runs migrations. A migration failure is returned rather than
    /// continuing with a partially initialized database.
    pub async fn initialize(
        data_dir: PathBuf,
        environment: Box<dyn Environment>,
    ) -> Result<Self, AppError> {
        let backup_dir = data_dir.join("backups");
        let export_dir = data_dir.join("exports");
        // Staged candidates are single-use; anything left is from a crashed run.
        let _ = std::fs::remove_dir_all(staging_dir(&data_dir));
        for dir in [&data_dir, &backup_dir, &export_dir, &staging_dir(&data_dir)] {
            std::fs::create_dir_all(dir).map_err(|source| AppError::Startup {
                reason: format!("cannot create {}: {source}", dir.display()),
            })?;
        }

        let database_path = data_dir.join("config-forge.sqlite3");
        let database = Database::connect(&format!("sqlite://{}", database_path.display())).await?;
        database.migrate().await?;

        Ok(Self {
            environment,
            database,
            data_dir,
            backup_dir,
            export_dir,
        })
    }

    pub fn staging_dir(&self) -> PathBuf {
        staging_dir(&self.data_dir)
    }
}

fn staging_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("staging")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filesystem::paths::TestEnvironment;

    #[tokio::test]
    async fn initialize_creates_directories_and_migrates() {
        let dir = tempfile::tempdir().unwrap();
        let data_dir = dir.path().join("app-data");

        let state = AppState::initialize(data_dir.clone(), Box::new(TestEnvironment::new()))
            .await
            .unwrap();

        assert!(state.backup_dir.is_dir());
        assert!(state.export_dir.is_dir());
        assert!(state.staging_dir().is_dir());
        let tables: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table'")
                .fetch_all(state.database.pool())
                .await
                .unwrap();
        assert!(tables.iter().any(|table| table == "projects"));
        let mode: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(state.database.pool())
            .await
            .unwrap();
        assert_eq!(mode, "wal");
    }

    #[tokio::test]
    async fn initialize_clears_leftover_staged_candidates() {
        let dir = tempfile::tempdir().unwrap();
        let data_dir = dir.path().join("app-data");
        let leftover = data_dir.join("staging").join("old-id");
        std::fs::create_dir_all(&leftover).unwrap();
        std::fs::write(leftover.join("kitty.conf"), "stale").unwrap();

        let state = AppState::initialize(data_dir, Box::new(TestEnvironment::new()))
            .await
            .unwrap();

        assert_eq!(std::fs::read_dir(state.staging_dir()).unwrap().count(), 0);
    }

    #[tokio::test]
    async fn initialize_fails_when_the_data_directory_is_unusable() {
        let dir = tempfile::tempdir().unwrap();
        let blocker = dir.path().join("not-a-directory");
        std::fs::write(&blocker, b"file").unwrap();

        let result =
            AppState::initialize(blocker.join("data"), Box::new(TestEnvironment::new())).await;

        assert!(matches!(result, Err(AppError::Startup { .. })));
    }
}
