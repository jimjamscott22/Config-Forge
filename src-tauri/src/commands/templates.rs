use chrono::Utc;
use serde_json::Value;
use tauri::State;

use crate::db::templates::{TemplateRepository, TemplateRow};
use crate::db::Database;
use crate::error::AppError;
use crate::state::AppState;

fn invalid(reason: impl Into<String>) -> AppError {
    AppError::InvalidInput {
        reason: reason.into(),
    }
}

fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str, AppError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| invalid(format!("missing or non-text field: {key}")))
}

/// Personal templates only: a claimed built-in flag is never trusted, and the
/// backend (not the caller) stamps `created_at`/`updated_at`.
fn template_row(template: &Value, now: &str) -> Result<TemplateRow, AppError> {
    if template.get("builtIn").and_then(Value::as_bool) == Some(true) {
        return Err(invalid("built-in templates are not stored"));
    }
    Ok(TemplateRow {
        id: text(template, "id")?.to_owned(),
        name: text(template, "name")?.to_owned(),
        terminal: text(template, "terminal")?.to_owned(),
        payload_json: serde_json::to_string(template).map_err(|e| invalid(e.to_string()))?,
        created_at: now.to_owned(),
        updated_at: now.to_owned(),
    })
}

fn parse_payload(payload: &str) -> Result<Value, AppError> {
    serde_json::from_str(payload).map_err(|e| invalid(format!("stored template is corrupt: {e}")))
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub async fn create(database: &Database, template: &Value) -> Result<(), AppError> {
    TemplateRepository::new(database.pool().clone())
        .create(&template_row(template, &now())?)
        .await
}

pub async fn update(database: &Database, template: &Value) -> Result<(), AppError> {
    TemplateRepository::new(database.pool().clone())
        .update(&template_row(template, &now())?)
        .await
}

pub async fn get(database: &Database, id: &str) -> Result<Option<Value>, AppError> {
    TemplateRepository::new(database.pool().clone())
        .get(id)
        .await?
        .map(|row| parse_payload(&row.payload_json))
        .transpose()
}

pub async fn list(database: &Database, terminal: Option<&str>) -> Result<Vec<Value>, AppError> {
    TemplateRepository::new(database.pool().clone())
        .list(terminal)
        .await?
        .iter()
        .map(|row| parse_payload(&row.payload_json))
        .collect()
}

pub async fn delete(database: &Database, id: &str) -> Result<(), AppError> {
    TemplateRepository::new(database.pool().clone())
        .delete(id)
        .await
}

#[tauri::command]
pub async fn list_templates(
    state: State<'_, AppState>,
    terminal: Option<String>,
) -> Result<Vec<Value>, AppError> {
    list(&state.database, terminal.as_deref()).await
}

#[tauri::command]
pub async fn get_template(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<Value>, AppError> {
    get(&state.database, &id).await
}

#[tauri::command]
pub async fn create_template(state: State<'_, AppState>, template: Value) -> Result<(), AppError> {
    create(&state.database, &template).await
}

#[tauri::command]
pub async fn update_template(state: State<'_, AppState>, template: Value) -> Result<(), AppError> {
    update(&state.database, &template).await
}

#[tauri::command]
pub async fn delete_template(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    delete(&state.database, &id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn template(id: &str, terminal: &str) -> Value {
        json!({
            "id": id, "name": "Mine", "description": "", "terminal": terminal,
            "builtIn": false, "shared": {}, "overrides": {}
        })
    }

    async fn database() -> Database {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database.migrate().await.unwrap();
        database
    }

    #[tokio::test]
    async fn templates_round_trip_and_filter_by_terminal() {
        let database = database().await;
        create(&database, &template("a", "ghostty")).await.unwrap();
        create(&database, &template("b", "kitty")).await.unwrap();
        create(&database, &template("c", "portable")).await.unwrap();

        assert_eq!(list(&database, None).await.unwrap().len(), 3);
        assert_eq!(list(&database, Some("kitty")).await.unwrap().len(), 2);
        assert_eq!(
            get(&database, "a").await.unwrap(),
            Some(template("a", "ghostty"))
        );

        let mut renamed = template("a", "ghostty");
        renamed["name"] = json!("Renamed");
        update(&database, &renamed).await.unwrap();
        assert_eq!(get(&database, "a").await.unwrap(), Some(renamed));

        delete(&database, "a").await.unwrap();
        assert_eq!(get(&database, "a").await.unwrap(), None);
        assert!(matches!(
            delete(&database, "a").await,
            Err(AppError::NotFound { .. })
        ));
    }

    #[tokio::test]
    async fn built_in_and_unknown_terminal_templates_are_rejected() {
        let database = database().await;
        let mut builtin = template("x", "ghostty");
        builtin["builtIn"] = json!(true);
        assert!(create(&database, &builtin).await.is_err());
        assert!(create(&database, &template("y", "xterm")).await.is_err());
        assert!(list(&database, None).await.unwrap().is_empty());
    }
}
