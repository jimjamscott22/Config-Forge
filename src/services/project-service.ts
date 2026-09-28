import { getAdapter } from "../adapters/registry";
import { projectPayloadSchema, type TerminalProject } from "../domain/project";
import type { TerminalId } from "../domain/shared-config";
import {
  snapshotSchema,
  type ProjectSnapshot,
  type SnapshotDetails,
  type AutomaticSnapshotReason,
} from "../domain/snapshot";
import { projectClient, type ProjectClient } from "./tauri-client";
import { translateProject } from "./translation-service";

export const AUTOMATIC_SNAPSHOT_LIMIT = 20;

export interface CreateProjectRequest {
  name: string;
  terminal: TerminalId;
  source?: string;
  sourcePath?: string | null;
  destinationPath?: string | null;
}

export function makeProject(request: CreateProjectRequest): TerminalProject {
  const parsed = getAdapter(request.terminal).parse(request.source ?? "");
  const now = new Date().toISOString();
  return projectPayloadSchema.parse({
    ...parsed,
    id: crypto.randomUUID(),
    name: request.name,
    terminal: request.terminal,
    sourcePath: request.sourcePath ?? null,
    destinationPath: request.destinationPath ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function createProject(
  request: CreateProjectRequest,
  client: ProjectClient = projectClient,
): Promise<TerminalProject> {
  const project = makeProject(request);
  await client.createProject(project);
  return project;
}

export async function saveProject(
  project: TerminalProject,
  client: ProjectClient = projectClient,
): Promise<TerminalProject> {
  const saved = projectPayloadSchema.parse({
    ...project,
    updatedAt: new Date().toISOString(),
  });
  await client.saveProject(saved);
  return saved;
}

export async function listProjects(
  client: ProjectClient = projectClient,
): Promise<TerminalProject[]> {
  return (await client.listProjects()).map((project) =>
    projectPayloadSchema.parse(project),
  );
}

export async function getProject(
  id: string,
  client: ProjectClient = projectClient,
): Promise<TerminalProject> {
  const project = await client.getProject(id);
  if (!project) throw new Error(`Project not found: ${id}`);
  return projectPayloadSchema.parse(project);
}

export async function createSnapshot(
  project: TerminalProject,
  details: SnapshotDetails,
  client: ProjectClient = projectClient,
): Promise<ProjectSnapshot> {
  const snapshot = snapshotSchema.parse({
    id: crypto.randomUUID(),
    projectId: project.id,
    project,
    createdAt: new Date().toISOString(),
    ...details,
    label: details.kind === "named" ? details.label : null,
    reason: details.kind === "automatic" ? details.reason : null,
  });
  // Persistence must insert and prune in one transaction, preserving every named snapshot.
  await client.createSnapshot(snapshot, AUTOMATIC_SNAPSHOT_LIMIT);
  return snapshot;
}

export async function listSnapshots(
  projectId: string,
  client: ProjectClient = projectClient,
): Promise<ProjectSnapshot[]> {
  return (await client.listSnapshots(projectId)).map((snapshot) =>
    snapshotSchema.parse(snapshot),
  );
}

export async function replaceProject(
  current: TerminalProject,
  replacement: TerminalProject,
  reason: AutomaticSnapshotReason,
  client: ProjectClient = projectClient,
): Promise<TerminalProject> {
  if (current.id !== replacement.id)
    throw new Error("Replacement must belong to the same project.");
  const next = projectPayloadSchema.parse({
    ...replacement,
    createdAt: current.createdAt,
  });
  await createSnapshot(current, { kind: "automatic", reason }, client);
  return saveProject(next, client);
}

export async function importProject(
  request: CreateProjectRequest & { source: string },
  client: ProjectClient = projectClient,
  current?: TerminalProject,
): Promise<TerminalProject> {
  if (!current) return createProject(request, client);
  const replacement = {
    ...makeProject(request),
    id: current.id,
    createdAt: current.createdAt,
    sourcePath:
      request.sourcePath === undefined
        ? current.sourcePath
        : request.sourcePath,
    destinationPath:
      request.destinationPath === undefined
        ? current.destinationPath
        : request.destinationPath,
  };
  return replaceProject(
    current,
    replacement,
    "before-import-replacement",
    client,
  );
}

export async function restoreSnapshot(
  current: TerminalProject,
  snapshotId: string,
  client: ProjectClient = projectClient,
): Promise<TerminalProject> {
  const found = await client.getSnapshot(snapshotId);
  if (!found) throw new Error(`Snapshot not found: ${snapshotId}`);
  const snapshot = snapshotSchema.parse(found);
  if (snapshot.projectId !== current.id || snapshot.project.id !== current.id) {
    throw new Error("Snapshot belongs to another project.");
  }
  return replaceProject(current, snapshot.project, "before-restore", client);
}

export async function translateAndSaveProject(
  current: TerminalProject,
  terminal: TerminalId,
  name: string,
  client: ProjectClient = projectClient,
) {
  const translated = translateProject(current, terminal, name);
  await createSnapshot(
    current,
    { kind: "automatic", reason: "before-translation" },
    client,
  );
  await client.createProject(translated.project);
  return translated;
}

export async function exportProject(
  project: TerminalProject,
  path: string,
  client: ProjectClient = projectClient,
) {
  const generated = getAdapter(project.terminal).generate(project);
  if (generated.issues.some((issue) => issue.severity === "error"))
    throw new Error("Cannot export a config with generation errors.");
  if (
    !path ||
    path === project.sourcePath ||
    path === project.destinationPath
  ) {
    throw new Error("Use Apply to write a live project path.");
  }
  return client.exportConfig(path, generated.source);
}
