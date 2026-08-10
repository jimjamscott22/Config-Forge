use sqlx::{migrate::Migrator, SqlitePool};

use crate::error::AppError;

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

pub async fn run(pool: &SqlitePool) -> Result<(), AppError> {
    MIGRATOR.run(pool).await?;
    Ok(())
}
