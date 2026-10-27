import type { TerminalProject } from "../domain/project";
import type { TerminalId } from "../domain/shared-config";
import type { ProjectSnapshot } from "../domain/snapshot";
import {
  applyProject,
  createApplyDependencies,
  createNativeValidationDependency,
  type ApplyConfirmation,
  type ApplyResult,
} from "./apply-service";
import {
  createSnapshot,
  exportProject,
  restoreSnapshot,
  translateAndSaveProject,
} from "./project-service";
import {
  projectClient,
  type AppPaths,
  type PathInfo,
  type ProjectClient,
  type WriteReceipt,
} from "./tauri-client";
import type { TranslationReport } from "../domain/translation";

/** The persistent, file-touching operations the Studio offers on a saved project. */
export interface StudioWorkflows {
  paths: AppPaths;
  inspectDestination(path: string): Promise<PathInfo>;
  apply(
    project: TerminalProject,
    destination: string,
    confirm: (request: ApplyConfirmation) => Promise<boolean>,
  ): Promise<ApplyResult>;
  exportTo(project: TerminalProject, path: string): Promise<WriteReceipt>;
  translate(
    project: TerminalProject,
    terminal: TerminalId,
    name: string,
  ): Promise<{ project: TerminalProject; report: TranslationReport }>;
  snapshot(project: TerminalProject, label: string): Promise<ProjectSnapshot>;
  restore(
    project: TerminalProject,
    snapshotId: string,
  ): Promise<TerminalProject>;
}

const EXPORT_NAMES: Record<TerminalId, string> = {
  ghostty: "config",
  kitty: "kitty.conf",
  alacritty: "alacritty.toml",
};

export function backupRootFor(paths: AppPaths, project: TerminalProject) {
  return `${paths.backupDir}/${project.terminal}/${project.id}`;
}

export function defaultExportPath(paths: AppPaths, project: TerminalProject) {
  return `${paths.exportDir}/${project.id}-${EXPORT_NAMES[project.terminal]}`;
}

export function createStudioWorkflows(
  paths: AppPaths,
  client: ProjectClient = projectClient,
): StudioWorkflows {
  return {
    paths,
    inspectDestination: (path) => client.inspectPath(path),
    apply: async (project, destination, confirm) => {
      const currentSource = await client.readOptionalTextFile(destination);
      // Validate a hidden copy beside the destination so relative includes resolve.
      const stage = async (candidate: string) => {
        const path = await client.stageCandidate(candidate, destination);
        return { path, cleanup: () => client.removeStagedCandidate(path) };
      };
      const deps = createApplyDependencies(
        project,
        {
          path: destination,
          currentSource,
          backupRoot: backupRootFor(paths, project),
        },
        {
          validateNative: createNativeValidationDependency(stage),
          confirm,
        },
        client,
      );
      return applyProject(project, deps);
    },
    exportTo: (project, path) => exportProject(project, path, client),
    translate: (project, terminal, name) =>
      translateAndSaveProject(project, terminal, name, client),
    snapshot: (project, label) =>
      createSnapshot(project, { kind: "named", label }, client),
    restore: (project, snapshotId) =>
      restoreSnapshot(project, snapshotId, client),
  };
}

/** What the apply review shows about the destination, resolved before confirmation. */
export async function describeDestination(
  workflows: StudioWorkflows,
  project: TerminalProject,
  destination: string,
) {
  const info = await workflows.inspectDestination(destination);
  return {
    exists: info.exists,
    isSymlink: info.isSymlink,
    backupDestination: info.exists
      ? backupRootFor(workflows.paths, project)
      : null,
  };
}
