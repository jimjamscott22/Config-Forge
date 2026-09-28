import { getAdapter } from "../adapters/registry";
import type { TerminalProject } from "../domain/project";
import { configTemplateSchema, type ConfigTemplate } from "../domain/template";
import { sharedConfigSchema, type TerminalId } from "../domain/shared-config";
import { makeProject, replaceProject, createProject } from "./project-service";
import { projectClient, type ProjectClient } from "./tauri-client";

// Built-in catalogs and personal-template CRUD are scheduled for Task 16.
export function projectFromTemplate(
  template: ConfigTemplate,
  terminal: TerminalId,
  name: string,
): TerminalProject {
  const checked = configTemplateSchema.parse(template);
  if (checked.terminal !== "portable" && checked.terminal !== terminal) {
    throw new Error(
      "Template is for a different terminal; translate it first.",
    );
  }
  const project = makeProject({ terminal, name });
  project.shared = sharedConfigSchema.parse(checked.shared);
  if (checked.terminal !== "portable")
    project.overrides = structuredClone(checked.overrides);
  const generated = getAdapter(terminal).generate(project);
  if (generated.issues.some((issue) => issue.severity === "error"))
    throw new Error("Template could not be generated.");
  const parsed = getAdapter(terminal).parse(generated.source);
  return {
    ...project,
    shared: parsed.shared,
    overrides: parsed.overrides,
    document: parsed.document,
    unmappedNodeIds: parsed.unmappedNodeIds,
  };
}

export async function applyTemplate(
  current: TerminalProject,
  template: ConfigTemplate,
  client: ProjectClient = projectClient,
): Promise<TerminalProject> {
  const replacement = projectFromTemplate(
    template,
    current.terminal,
    current.name,
  );
  return replaceProject(
    current,
    {
      ...replacement,
      id: current.id,
      createdAt: current.createdAt,
      sourcePath: current.sourcePath,
      destinationPath: current.destinationPath,
    },
    "before-template-replacement",
    client,
  );
}

export async function createProjectFromTemplate(
  template: ConfigTemplate,
  terminal: TerminalId,
  name: string,
  client: ProjectClient = projectClient,
) {
  const draft = projectFromTemplate(template, terminal, name);
  return createProject(
    { terminal, name, source: getAdapter(terminal).generate(draft).source },
    client,
  );
}
