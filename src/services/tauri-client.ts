import { invoke } from "@tauri-apps/api/core";
import type { DetectedInstallation } from "../adapters/terminal-adapter";

export async function detectTerminals(): Promise<DetectedInstallation[]> {
  return invoke("detect_terminals");
}

import type { TerminalProject } from "../domain/project";
import type { ProjectSnapshot } from "../domain/snapshot";
import type { TerminalId } from "../domain/shared-config";
import type { ConfigTemplate } from "../domain/template";
import type { NativeValidationRequest } from "../adapters/terminal-adapter";
import type { ValidationResult } from "../domain/validation";
import type { AtomicWriteRequest, BackupRequest } from "./apply-service";

export interface PathInfo {
  exists: boolean;
  isSymlink: boolean;
}
export interface BackupRecord {
  path: string;
  sha256: string;
}
export interface WriteReceipt {
  bytesWritten: number;
  sha256: string;
}

export interface ProjectClient {
  createProject(project: TerminalProject): Promise<void>;
  saveProject(project: TerminalProject): Promise<void>;
  getProject(id: string): Promise<TerminalProject | null>;
  listProjects(): Promise<TerminalProject[]>;
  createSnapshot(
    snapshot: ProjectSnapshot,
    automaticLimit: number,
  ): Promise<void>;
  getSnapshot(id: string): Promise<ProjectSnapshot | null>;
  listSnapshots(projectId: string): Promise<ProjectSnapshot[]>;
  readTextFile(path: string): Promise<string>;
  inspectPath(path: string): Promise<PathInfo>;
  /** Null when the file does not exist, so new destinations are not errors. */
  readOptionalTextFile(path: string): Promise<string | null>;
  exportConfig(target: string, candidate: string): Promise<WriteReceipt>;
  createBackup(request: BackupRequest): Promise<BackupRecord>;
  applyConfig(request: AtomicWriteRequest): Promise<WriteReceipt>;
  /** Writes the candidate to a private staging file for native validation. */
  stageCandidate(candidate: string, terminal: TerminalId): Promise<string>;
  removeStagedCandidate(path: string): Promise<void>;
}

export interface AppPaths {
  dataDir: string;
  backupDir: string;
  exportDir: string;
}

export async function getAppPaths(): Promise<AppPaths> {
  return invoke("get_app_paths");
}

// Registered in src-tauri/src/lib.rs; they only work inside the desktop shell.
export const projectClient: ProjectClient = {
  createProject: (project) => invoke("create_project", { project }),
  saveProject: (project) => invoke("save_project", { project }),
  getProject: (id) => invoke("get_project", { id }),
  listProjects: () => invoke("list_projects"),
  createSnapshot: (snapshot, automaticLimit) =>
    invoke("create_snapshot", { snapshot, automaticLimit }),
  getSnapshot: (id) => invoke("get_snapshot", { id }),
  listSnapshots: (projectId) => invoke("list_snapshots", { projectId }),
  readTextFile: (path) => invoke("read_text_file", { path }),
  inspectPath: (path) => invoke("inspect_path", { path }),
  readOptionalTextFile: (path) => invoke("read_optional_text_file", { path }),
  exportConfig: (target, candidate) =>
    invoke("export_config", { target, candidate }),
  createBackup: ({ target, backupRoot }) =>
    invoke("create_config_backup", { target, backupRoot }),
  applyConfig: (request) => invoke("apply_config", { request }),
  stageCandidate: (candidate, terminal) =>
    invoke("stage_candidate", { candidate, terminal }),
  removeStagedCandidate: (path) => invoke("remove_staged_candidate", { path }),
};

/** Personal templates only; built-ins live in the frontend catalog. */
export interface TemplateClient {
  listTemplates(terminal?: TerminalId): Promise<ConfigTemplate[]>;
  getTemplate(id: string): Promise<ConfigTemplate | null>;
  createTemplate(template: ConfigTemplate): Promise<void>;
  updateTemplate(template: ConfigTemplate): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
}

export const templateClient: TemplateClient = {
  listTemplates: (terminal) => invoke("list_templates", { terminal }),
  getTemplate: (id) => invoke("get_template", { id }),
  createTemplate: (template) => invoke("create_template", { template }),
  updateTemplate: (template) => invoke("update_template", { template }),
  deleteTemplate: (id) => invoke("delete_template", { id }),
};

export async function validateCandidate(
  request: NativeValidationRequest,
): Promise<ValidationResult> {
  return invoke("validate_candidate", { request });
}
