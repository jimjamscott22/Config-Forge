use sqlx::SqlitePool;

use crate::error::AppError;

const TERMINALS: [&str; 4] = ["ghostty", "kitty", "alacritty", "portable"];

/// A personal template. Built-ins live in the frontend catalog; the repository
/// only ever reads, writes, or deletes rows with `built_in = 0`.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct TemplateRow {
    pub id: String,
    pub name: String,
    pub terminal: String,
    pub payload_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone)]
pub struct TemplateRepository {
    pool: SqlitePool,
}

fn check_terminal(terminal: &str) -> Result<(), AppError> {
    if TERMINALS.contains(&terminal) {
        Ok(())
    } else {
        Err(AppError::InvalidInput {
            reason: format!("unknown template terminal: {terminal}"),
        })
    }
}

impl TemplateRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, row: &TemplateRow) -> Result<(), AppError> {
        check_terminal(&row.terminal)?;
        sqlx::query(
            "INSERT INTO templates (id, name, terminal, built_in, payload_json, created_at, updated_at) \
             VALUES (?, ?, ?, 0, ?, ?, ?)",
        )
        .bind(&row.id)
        .bind(&row.name)
        .bind(&row.terminal)
        .bind(&row.payload_json)
        .bind(&row.created_at)
        .bind(&row.updated_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get(&self, id: &str) -> Result<Option<TemplateRow>, AppError> {
        let row = sqlx::query_as::<_, TemplateRow>(
            "SELECT id, name, terminal, payload_json, created_at, updated_at \
             FROM templates WHERE id = ? AND built_in = 0",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    /// Lists personal templates, newest first. With a terminal, portable
    /// templates are included alongside that terminal's own.
    pub async fn list(&self, terminal: Option<&str>) -> Result<Vec<TemplateRow>, AppError> {
        if let Some(terminal) = terminal {
            check_terminal(terminal)?;
        }
        let rows = sqlx::query_as::<_, TemplateRow>(
            "SELECT id, name, terminal, payload_json, created_at, updated_at FROM templates \
             WHERE built_in = 0 AND (? IS NULL OR terminal = ? OR terminal = 'portable') \
             ORDER BY updated_at DESC, id ASC",
        )
        .bind(terminal)
        .bind(terminal)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    pub async fn update(&self, row: &TemplateRow) -> Result<(), AppError> {
        check_terminal(&row.terminal)?;
        let result = sqlx::query(
            "UPDATE templates SET name = ?, terminal = ?, payload_json = ?, updated_at = ? \
             WHERE id = ? AND built_in = 0",
        )
        .bind(&row.name)
        .bind(&row.terminal)
        .bind(&row.payload_json)
        .bind(&row.updated_at)
        .bind(&row.id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound {
                entity: "template",
                id: row.id.clone(),
            });
        }

        Ok(())
    }

    pub async fn delete(&self, id: &str) -> Result<(), AppError> {
        let result = sqlx::query("DELETE FROM templates WHERE id = ? AND built_in = 0")
            .bind(id)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound {
                entity: "template",
                id: id.to_owned(),
            });
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{TemplateRepository, TemplateRow};
    use crate::{db::Database, error::AppError};

    fn template_fixture(id: &str, terminal: &str, updated_at: &str) -> TemplateRow {
        TemplateRow {
            id: id.into(),
            name: format!("Template {id}"),
            terminal: terminal.into(),
            payload_json: r#"{"shared":{}}"#.into(),
            created_at: "2026-08-09T00:00:00Z".into(),
            updated_at: updated_at.into(),
        }
    }

    async fn database() -> Database {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database.migrate().await.unwrap();
        database
    }

    #[tokio::test]
    async fn creates_updates_lists_and_deletes_a_template() {
        let repository = TemplateRepository::new(database().await.pool().clone());
        let mut template = template_fixture("a", "ghostty", "2026-08-09T00:00:00Z");

        repository.create(&template).await.unwrap();
        assert_eq!(repository.get("a").await.unwrap(), Some(template.clone()));

        template.name = "Renamed".into();
        template.updated_at = "2026-08-09T01:00:00Z".into();
        repository.update(&template).await.unwrap();
        assert_eq!(repository.list(None).await.unwrap(), vec![template.clone()]);

        repository.delete("a").await.unwrap();
        assert_eq!(repository.get("a").await.unwrap(), None);
        assert!(matches!(
            repository.delete("a").await,
            Err(AppError::NotFound {
                entity: "template",
                ..
            })
        ));
    }

    #[tokio::test]
    async fn lists_by_terminal_including_portable_newest_first() {
        let repository = TemplateRepository::new(database().await.pool().clone());
        let ghostty = template_fixture("g", "ghostty", "2026-08-09T01:00:00Z");
        let kitty = template_fixture("k", "kitty", "2026-08-09T02:00:00Z");
        let portable = template_fixture("p", "portable", "2026-08-09T03:00:00Z");
        for row in [&ghostty, &kitty, &portable] {
            repository.create(row).await.unwrap();
        }

        assert_eq!(
            repository.list(Some("ghostty")).await.unwrap(),
            vec![portable.clone(), ghostty]
        );
        assert_eq!(
            repository.list(Some("kitty")).await.unwrap(),
            vec![portable.clone(), kitty]
        );
        assert!(repository.list(Some("wezterm")).await.is_err());
    }

    #[tokio::test]
    async fn rejects_unknown_terminals_and_duplicate_ids() {
        let repository = TemplateRepository::new(database().await.pool().clone());
        let template = template_fixture("a", "ghostty", "2026-08-09T00:00:00Z");
        repository.create(&template).await.unwrap();

        assert!(repository.create(&template).await.is_err());
        let mut invalid = template_fixture("b", "wezterm", "2026-08-09T00:00:00Z");
        assert!(matches!(
            repository.create(&invalid).await,
            Err(AppError::InvalidInput { .. })
        ));
        invalid.id = "a".into();
        assert!(repository.update(&invalid).await.is_err());
    }

    #[tokio::test]
    async fn never_reads_changes_or_deletes_built_in_rows() {
        let database = database().await;
        sqlx::query(
            "INSERT INTO templates (id, name, terminal, built_in, payload_json, created_at, updated_at) \
             VALUES ('builtin', 'Built in', 'portable', 1, '{}', 'x', 'x')",
        )
        .execute(database.pool())
        .await
        .unwrap();
        let repository = TemplateRepository::new(database.pool().clone());

        assert_eq!(repository.get("builtin").await.unwrap(), None);
        assert!(repository.list(None).await.unwrap().is_empty());
        let attempt = template_fixture("builtin", "portable", "y");
        assert!(matches!(
            repository.update(&attempt).await,
            Err(AppError::NotFound { .. })
        ));
        assert!(matches!(
            repository.delete("builtin").await,
            Err(AppError::NotFound { .. })
        ));
        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM templates")
            .fetch_one(database.pool())
            .await
            .unwrap();
        assert_eq!(remaining, 1);
    }
}
