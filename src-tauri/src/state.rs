use std::path::PathBuf;

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
        for dir in [&data_dir, &backup_dir, &export_dir] {
            std::fs::create_dir_all(dir).map_err(|source| AppError::Startup {
                reason: format!("cannot create {}: {source}", dir.display()),
            })?;
        }

        let database = Database::connect_file(&data_dir.join("config-forge.sqlite3")).await?;
        database.migrate().await?;

        Ok(Self {
            environment,
            database,
            data_dir,
            backup_dir,
            export_dir,
        })
    }
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
    async fn initialize_fails_when_the_data_directory_is_unusable() {
        let dir = tempfile::tempdir().unwrap();
        let blocker = dir.path().join("not-a-directory");
        std::fs::write(&blocker, b"file").unwrap();

        let result =
            AppState::initialize(blocker.join("data"), Box::new(TestEnvironment::new())).await;

        assert!(matches!(result, Err(AppError::Startup { .. })));
    }
}
