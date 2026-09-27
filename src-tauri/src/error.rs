#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database operation failed: {0}")]
    Database(#[from] sqlx::Error),
    #[error("database migration failed: {0}")]
    DatabaseMigration(#[from] sqlx::migrate::MigrateError),
    #[error("{entity} not found: {id}")]
    NotFound { entity: &'static str, id: String },
}

// Tauri serializes command errors back to the frontend; report them as a
// plain message rather than exposing internal error structure.
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
