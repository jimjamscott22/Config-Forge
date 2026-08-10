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
}

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

    #[tokio::test]
    async fn orders_projects_by_most_recent_update() {
        let repository = repository().await;
        let older = project_fixture();
        let mut newer = older.clone();
        newer.id = "22222222-2222-4222-8222-222222222222".into();
        newer.name = "Newer Kitty".into();
        newer.terminal = "kitty".into();
        newer.updated_at = "2026-08-09T01:00:00Z".into();

        repository.create(&older).await.unwrap();
        repository.create(&newer).await.unwrap();

        assert_eq!(repository.list().await.unwrap(), vec![newer, older]);
    }

    #[tokio::test]
    async fn enforces_ids_terminals_and_missing_rows() {
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
        assert!(matches!(
            repository.delete(&missing_project.id).await,
            Err(AppError::NotFound {
                entity: "project",
                ..
            })
        ));
    }
}
