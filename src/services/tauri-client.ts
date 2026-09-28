import { invoke } from "@tauri-apps/api/core";
import type { DetectedInstallation } from "../adapters/terminal-adapter";

export async function detectTerminals(): Promise<DetectedInstallation[]> {
  return invoke("detect_terminals");
}

import type { TerminalProject } from "../domain/project";
import type { ProjectSnapshot } from "../domain/snapshot";
import type { NativeValidationRequest } from "../adapters/terminal-adapter";
import type { ValidationResult } from "../domain/validation";
import type { AtomicWriteRequest, BackupRequest } from "./apply-service";

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
  exportConfig(target: string, candidate: string): Promise<WriteReceipt>;
  createBackup(request: BackupRequest): Promise<BackupRecord>;
  applyConfig(request: AtomicWriteRequest): Promise<WriteReceipt>;
}

// These project/history/file command contracts are registered with desktop startup in Task 17.
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
  exportConfig: (target, candidate) =>
    invoke("export_config", { target, candidate }),
  createBackup: ({ target, backupRoot }) =>
    invoke("create_config_backup", { target, backupRoot }),
  applyConfig: (request) => invoke("apply_config", { request }),
};

export async function validateCandidate(
  request: NativeValidationRequest,
): Promise<ValidationResult> {
  return invoke("validate_candidate", { request });
}
export async function writeFileAtomically(
  target: string,
  candidate: string,
): Promise<WriteReceipt> {
  return invoke("write_file_atomically", { target, candidate });
}
