#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database operation failed: {0}")]
    Database(#[from] sqlx::Error),
    #[error("database migration failed: {0}")]
    DatabaseMigration(#[from] sqlx::migrate::MigrateError),
    #[error("{entity} not found: {id}")]
    NotFound { entity: &'static str, id: String },
    #[error("refusing to write through symlink: {path}")]
    TargetIsSymlink { path: String },
    #[error("atomic write to {path} failed: {reason}")]
    AtomicWriteFailed { path: String, reason: String },
    #[error("read-back of {path} did not match the candidate bytes")]
    ReadbackMismatch { path: String },
    #[error("backup of {path} failed: {reason}")]
    BackupFailed { path: String, reason: String },
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
