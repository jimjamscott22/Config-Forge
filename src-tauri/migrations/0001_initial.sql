PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  terminal TEXT NOT NULL CHECK (terminal IN ('ghostty', 'kitty', 'alacritty')),
  payload_json TEXT NOT NULL,
  source_path TEXT,
  destination_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  label TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('automatic', 'named')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_snapshots_project_created
ON snapshots(project_id, created_at DESC);

CREATE TABLE templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  terminal TEXT NOT NULL,
  built_in INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE validation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  native_available INTEGER NOT NULL,
  valid INTEGER NOT NULL,
  issues_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE preferences (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL
);
