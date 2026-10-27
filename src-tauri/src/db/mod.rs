mod migrations;
pub mod projects;
pub mod snapshots;
pub mod templates;

use std::str::FromStr;

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
    SqlitePool,
};

use crate::error::AppError;

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn connect(url: &str) -> Result<Self, AppError> {
        let in_memory = url == "sqlite::memory:";
        Self::open(SqliteConnectOptions::from_str(url)?, in_memory).await
    }

    /// Opens a database file by path, so characters such as `?` or `%` in the
    /// app-data directory are never parsed as part of a URL.
    pub async fn connect_file(path: &std::path::Path) -> Result<Self, AppError> {
        Self::open(SqliteConnectOptions::new().filename(path), false).await
    }

    async fn open(options: SqliteConnectOptions, in_memory: bool) -> Result<Self, AppError> {
        let max_connections = if in_memory { 1 } else { 5 };
        let mut options = options.create_if_missing(!in_memory).foreign_keys(true);
        if !in_memory {
            options = options.journal_mode(SqliteJournalMode::Wal);
        }
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

#[cfg(test)]
mod tests {
    use super::Database;

    #[tokio::test]
    async fn migrates_the_initial_schema() {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database.migrate().await.unwrap();

        let tables: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
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
