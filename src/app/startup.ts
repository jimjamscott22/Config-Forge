import type { DetectedInstallation } from "../adapters/terminal-adapter";
import type { TerminalProject } from "../domain/project";
import type { ConfigTemplate } from "../domain/template";
import { listProjects } from "../services/project-service";
import {
  detectTerminals,
  getAppPaths,
  projectClient,
  templateClient,
  type AppPaths,
  type ProjectClient,
  type TemplateClient,
} from "../services/tauri-client";

export interface StartupData {
  detectedTerminals: DetectedInstallation[];
  /** Set when detection failed but the database is still usable. */
  detectionError: string | null;
  recentProjects: TerminalProject[];
  /** Personal templates only; built-ins come from the frontend catalog. */
  templates: ConfigTemplate[];
  paths: AppPaths;
}

export interface StartupDependencies {
  detectTerminals(): Promise<DetectedInstallation[]>;
  getAppPaths(): Promise<AppPaths>;
  projects: ProjectClient;
  templates: TemplateClient;
}

const defaults: StartupDependencies = {
  detectTerminals,
  getAppPaths,
  projects: projectClient,
  templates: templateClient,
};

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Loads everything the Home screen needs. A database failure rejects (there is
 * no working persistence to continue with); a detection failure is recoverable
 * and reported alongside the otherwise complete data.
 */
export async function loadStartupData(
  deps: StartupDependencies = defaults,
): Promise<StartupData> {
  const [detection, recentProjects, templates, paths] = await Promise.all([
    deps.detectTerminals().then(
      (installations) => ({ installations, error: null }),
      (error: unknown) => ({
        installations: [] as DetectedInstallation[],
        error: describe(error),
      }),
    ),
    listProjects(deps.projects),
    deps.templates.listTemplates(),
    deps.getAppPaths(),
  ]);
  return {
    detectedTerminals: detection.installations,
    detectionError: detection.error,
    recentProjects,
    templates,
    paths,
  };
}
