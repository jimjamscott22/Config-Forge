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

    pub async fn list_for_project(&self, project_id: &str) -> Result<Vec<SnapshotRow>, AppError> {
        let rows = sqlx::query_as::<_, SnapshotRow>(
            "SELECT id, project_id, label, kind, payload_json, created_at FROM snapshots \
             WHERE project_id = ? ORDER BY created_at DESC, id ASC",
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    pub async fn restore_payload(&self, snapshot_id: &str) -> Result<Option<String>, AppError> {
        let payload = sqlx::query_scalar("SELECT payload_json FROM snapshots WHERE id = ?")
            .bind(snapshot_id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(payload)
    }
}

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

    #[tokio::test]
    async fn enforces_snapshot_constraints_and_project_cascade() {
        let (database, project) = database_with_project().await;
        let snapshot_repository = SnapshotRepository::new(database.pool().clone());
        let project_repository = ProjectRepository::new(database.pool().clone());
        let valid = snapshot_fixture(&project.id, "snapshot-1", "2026-08-09T00:00:00Z");
        snapshot_repository.create(&valid).await.unwrap();

        let mut invalid_kind = snapshot_fixture(&project.id, "snapshot-2", "2026-08-09T01:00:00Z");
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
}
