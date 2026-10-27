import { vi } from "vitest";
import type { TerminalProject } from "../../domain/project";
import type { ProjectSnapshot } from "../../domain/snapshot";
import type { ProjectClient } from "../../services/tauri-client";

export function makeProjectClient() {
  const projects = new Map<string, TerminalProject>();
  const snapshots = new Map<string, ProjectSnapshot>();
  const client = {
    createProject: vi.fn(async (project: TerminalProject) => {
      projects.set(project.id, structuredClone(project));
    }),
    saveProject: vi.fn(async (project: TerminalProject) => {
      projects.set(project.id, structuredClone(project));
    }),
    getProject: vi.fn(async (id: string) => projects.get(id) ?? null),
    listProjects: vi.fn(async () => [...projects.values()]),
    createSnapshot: vi.fn(async (snapshot: ProjectSnapshot, limit: number) => {
      if (limit !== 20) throw new Error("Unexpected retention limit");
      snapshots.set(snapshot.id, structuredClone(snapshot));
    }),
    getSnapshot: vi.fn(async (id: string) => snapshots.get(id) ?? null),
    listSnapshots: vi.fn(async (projectId: string) =>
      [...snapshots.values()].filter(
        (snapshot) => snapshot.projectId === projectId,
      ),
    ),
    readTextFile: vi.fn<ProjectClient["readTextFile"]>(async () => "candidate"),
    inspectPath: vi.fn<ProjectClient["inspectPath"]>(async () => ({
      exists: false,
      isSymlink: false,
    })),
    readOptionalTextFile: vi.fn<ProjectClient["readOptionalTextFile"]>(
      async () => null,
    ),
    exportConfig: vi.fn<ProjectClient["exportConfig"]>(async () => ({
      bytesWritten: 9,
      sha256: "hash",
    })),
    createBackup: vi.fn<ProjectClient["createBackup"]>(async () => ({
      path: "/backups/config.bak",
      sha256: "old-hash",
    })),
    applyConfig: vi.fn<ProjectClient["applyConfig"]>(async () => ({
      bytesWritten: 9,
      sha256: "hash",
    })),
    stageCandidate: vi.fn<ProjectClient["stageCandidate"]>(
      async (_candidate, destination) => `${destination}.cfgforge-validate`,
    ),
    removeStagedCandidate: vi.fn<ProjectClient["removeStagedCandidate"]>(
      async () => undefined,
    ),
  } satisfies ProjectClient;
  return { client, projects, snapshots };
}
