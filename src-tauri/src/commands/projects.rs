use serde_json::Value;
use tauri::State;

use crate::db::projects::{ProjectRepository, ProjectRow};
use crate::db::snapshots::{SnapshotRepository, SnapshotRow};
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

fn optional_text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

/// The row keeps the complete `TerminalProject` JSON as its payload; the
/// columns are only an index over it.
fn project_row(project: &Value) -> Result<ProjectRow, AppError> {
    Ok(ProjectRow {
        id: text(project, "id")?.to_owned(),
        name: text(project, "name")?.to_owned(),
        terminal: text(project, "terminal")?.to_owned(),
        payload_json: serde_json::to_string(project).map_err(|e| invalid(e.to_string()))?,
        source_path: optional_text(project, "sourcePath"),
        destination_path: optional_text(project, "destinationPath"),
        created_at: text(project, "createdAt")?.to_owned(),
        updated_at: text(project, "updatedAt")?.to_owned(),
    })
}

/// The row keeps the complete `ProjectSnapshot` JSON, including its reason and
/// captured project.
fn snapshot_row(snapshot: &Value) -> Result<SnapshotRow, AppError> {
    let project_id = text(snapshot, "projectId")?;
    let captured = snapshot
        .get("project")
        .ok_or_else(|| invalid("snapshot is missing its project"))?;
    if text(captured, "id")? != project_id {
        return Err(invalid("snapshot payload belongs to another project"));
    }
    let kind = text(snapshot, "kind")?;
    if kind != "named" && kind != "automatic" {
        return Err(invalid(format!("unknown snapshot kind: {kind}")));
    }
    Ok(SnapshotRow {
        id: text(snapshot, "id")?.to_owned(),
        project_id: project_id.to_owned(),
        label: optional_text(snapshot, "label"),
        kind: kind.to_owned(),
        payload_json: serde_json::to_string(snapshot).map_err(|e| invalid(e.to_string()))?,
        created_at: text(snapshot, "createdAt")?.to_owned(),
    })
}

fn parse_payload(payload: &str) -> Result<Value, AppError> {
    serde_json::from_str(payload).map_err(|e| invalid(format!("stored payload is corrupt: {e}")))
}

pub async fn create(database: &Database, project: &Value) -> Result<(), AppError> {
    ProjectRepository::new(database.pool().clone())
        .create(&project_row(project)?)
        .await
}

pub async fn save(database: &Database, project: &Value) -> Result<(), AppError> {
    ProjectRepository::new(database.pool().clone())
        .update(&project_row(project)?)
        .await
}

pub async fn get(database: &Database, id: &str) -> Result<Option<Value>, AppError> {
    ProjectRepository::new(database.pool().clone())
        .get(id)
        .await?
        .map(|row| parse_payload(&row.payload_json))
        .transpose()
}

pub async fn list(database: &Database) -> Result<Vec<Value>, AppError> {
    ProjectRepository::new(database.pool().clone())
        .list()
        .await?
        .iter()
        .map(|row| parse_payload(&row.payload_json))
        .collect()
}

/// Insert and prune happen in one transaction; the retention limit is enforced
/// by the repository, not by the caller.
pub async fn create_snapshot_record(database: &Database, snapshot: &Value) -> Result<(), AppError> {
    SnapshotRepository::new(database.pool().clone())
        .create_retained(&snapshot_row(snapshot)?)
        .await
}

pub async fn get_snapshot_record(database: &Database, id: &str) -> Result<Option<Value>, AppError> {
    SnapshotRepository::new(database.pool().clone())
        .restore_payload(id)
        .await?
        .map(|payload| parse_payload(&payload))
        .transpose()
}

pub async fn list_snapshot_records(
    database: &Database,
    project_id: &str,
) -> Result<Vec<Value>, AppError> {
    SnapshotRepository::new(database.pool().clone())
        .list_for_project(project_id)
        .await?
        .iter()
        .map(|row| parse_payload(&row.payload_json))
        .collect()
}

#[tauri::command]
pub async fn create_project(state: State<'_, AppState>, project: Value) -> Result<(), AppError> {
    create(&state.database, &project).await
}

#[tauri::command]
pub async fn save_project(state: State<'_, AppState>, project: Value) -> Result<(), AppError> {
    save(&state.database, &project).await
}

#[tauri::command]
pub async fn get_project(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<Value>, AppError> {
    get(&state.database, &id).await
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Value>, AppError> {
    list(&state.database).await
}

// The frontend also sends its retention limit; the repository enforces the
// authoritative limit of 20 automatic snapshots per project.
#[tauri::command]
pub async fn create_snapshot(
    state: State<'_, AppState>,
    snapshot: Value,
    _automatic_limit: Option<u32>,
) -> Result<(), AppError> {
    create_snapshot_record(&state.database, &snapshot).await
}

#[tauri::command]
pub async fn get_snapshot(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<Value>, AppError> {
    get_snapshot_record(&state.database, &id).await
}

#[tauri::command]
pub async fn list_snapshots(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<Value>, AppError> {
    list_snapshot_records(&state.database, &project_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const ID: &str = "11111111-1111-4111-8111-111111111111";

    fn project(name: &str) -> Value {
        json!({
            "id": ID,
            "name": name,
            "terminal": "ghostty",
            "shared": {},
            "overrides": {},
            "document": [{"kind": "comment", "text": "# keep me"}],
            "unmappedNodeIds": [],
            "sourcePath": null,
            "destinationPath": "/home/me/.config/ghostty/config",
            "createdAt": "2026-10-01T00:00:00.000Z",
            "updatedAt": "2026-10-01T00:00:00.000Z"
        })
    }

    fn snapshot(id: &str, kind: &str, at: &str) -> Value {
        json!({
            "id": id,
            "projectId": ID,
            "createdAt": at,
            "project": project("Snapshotted"),
            "kind": kind,
            "label": if kind == "named" { json!("Keep") } else { Value::Null },
            "reason": if kind == "named" { Value::Null } else { json!("before-direct-apply") }
        })
    }

    async fn database() -> Database {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database.migrate().await.unwrap();
        database
    }

    #[tokio::test]
    async fn projects_round_trip_the_complete_document_json() {
        let database = database().await;
        let original = project("Daily Ghostty");
        create(&database, &original).await.unwrap();

        assert_eq!(get(&database, ID).await.unwrap(), Some(original.clone()));

        let mut edited = original.clone();
        edited["name"] = json!("Renamed");
        save(&database, &edited).await.unwrap();
        assert_eq!(list(&database).await.unwrap(), vec![edited]);
        assert_eq!(get(&database, "missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn saving_an_unknown_project_is_an_error() {
        let database = database().await;
        let result = save(&database, &project("Never created")).await;
        assert!(matches!(result, Err(AppError::NotFound { .. })));
    }

    #[tokio::test]
    async fn malformed_projects_are_rejected_before_storage() {
        let database = database().await;
        let result = create(&database, &json!({"id": ID})).await;
        assert!(matches!(result, Err(AppError::InvalidInput { .. })));
        assert!(list(&database).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn snapshots_keep_their_full_payload_and_prune_only_automatic_ones() {
        let database = database().await;
        create(&database, &project("Daily")).await.unwrap();
        let named = snapshot(
            "22222222-2222-4222-8222-000000000000",
            "named",
            "2026-10-01T00:00:00.000Z",
        );
        create_snapshot_record(&database, &named).await.unwrap();
        for index in 0..23 {
            let id = format!("33333333-3333-4333-8333-{index:012}");
            let at = format!("2026-10-02T00:00:{index:02}.000Z");
            create_snapshot_record(&database, &snapshot(&id, "automatic", &at))
                .await
                .unwrap();
        }

        let listed = list_snapshot_records(&database, ID).await.unwrap();
        assert_eq!(
            listed.iter().filter(|s| s["kind"] == "automatic").count(),
            20
        );
        assert!(listed.contains(&named));
        assert_eq!(
            get_snapshot_record(&database, "22222222-2222-4222-8222-000000000000")
                .await
                .unwrap(),
            Some(named)
        );
    }

    #[tokio::test]
    async fn snapshots_for_another_projects_payload_are_rejected() {
        let database = database().await;
        create(&database, &project("Daily")).await.unwrap();
        let mut bad = snapshot(
            "44444444-4444-4444-8444-000000000000",
            "named",
            "2026-10-01T00:00:00.000Z",
        );
        bad["project"]["id"] = json!("55555555-5555-4555-8555-555555555555");
        let result = create_snapshot_record(&database, &bad).await;
        assert!(matches!(result, Err(AppError::InvalidInput { .. })));
    }
}
