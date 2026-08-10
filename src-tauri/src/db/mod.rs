mod migrations;
pub mod projects;
pub mod snapshots;

use std::str::FromStr;

use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
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
        let max_connections = if in_memory { 1 } else { 5 };
        let options = SqliteConnectOptions::from_str(url)?
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
