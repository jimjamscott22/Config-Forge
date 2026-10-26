import { z } from "zod";
import { getAdapter } from "../adapters/registry";
import type { TerminalProject } from "../domain/project";
import { configTemplateSchema, type ConfigTemplate } from "../domain/template";
import { sharedConfigSchema, type TerminalId } from "../domain/shared-config";
import { builtinTemplates, getBuiltinTemplate } from "../templates/builtins";
import { makeProject, replaceProject, createProject } from "./project-service";
import {
  projectClient,
  templateClient,
  type ProjectClient,
  type TemplateClient,
} from "./tauri-client";

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

export type TemplateErrorCode =
  | "BUILTIN_TEMPLATE_IMMUTABLE"
  | "TEMPLATE_NOT_FOUND"
  | "INVALID_TEMPLATE_BUNDLE";

export class TemplateError extends Error {
  constructor(
    readonly code: TemplateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

export const TEMPLATE_BUNDLE_FORMAT = "config-forge-templates";
const bundleSchema = z.object({
  format: z.literal(TEMPLATE_BUNDLE_FORMAT),
  version: z.literal(1),
  templates: z
    .array(configTemplateSchema.omit({ id: true, builtIn: true }))
    .min(1)
    .max(100),
});

export type TemplatePatch = Partial<
  Pick<ConfigTemplate, "name" | "description" | "shared" | "overrides">
>;

export interface TemplateService {
  /** Built-ins first, then personal templates; portable ones match every terminal. */
  list(terminal?: TerminalId): Promise<ConfigTemplate[]>;
  get(id: string): Promise<ConfigTemplate>;
  createFromProject(
    project: TerminalProject,
    name: string,
    description?: string,
  ): Promise<ConfigTemplate>;
  duplicate(id: string, name: string): Promise<ConfigTemplate>;
  rename(id: string, name: string): Promise<ConfigTemplate>;
  update(id: string, patch: TemplatePatch): Promise<ConfigTemplate>;
  remove(id: string): Promise<void>;
  exportBundle(ids: string[]): Promise<string>;
  importBundle(json: string): Promise<ConfigTemplate[]>;
}

function assertMutable(id: string) {
  if (getBuiltinTemplate(id))
    throw new TemplateError(
      "BUILTIN_TEMPLATE_IMMUTABLE",
      "Built-in templates cannot be changed. Duplicate it to make an editable copy.",
    );
}

function matches(template: ConfigTemplate, terminal?: TerminalId) {
  return (
    !terminal ||
    template.terminal === "portable" ||
    template.terminal === terminal
  );
}

export function createTemplateService(
  client: TemplateClient = templateClient,
): TemplateService {
  function personal(
    parts: Omit<ConfigTemplate, "id" | "builtIn">,
  ): ConfigTemplate {
    return configTemplateSchema.parse({
      ...structuredClone(parts),
      id: crypto.randomUUID(),
      builtIn: false,
    });
  }
  async function get(id: string) {
    const builtin = getBuiltinTemplate(id);
    if (builtin) return structuredClone(builtin);
    const stored = await client.getTemplate(id);
    if (!stored)
      throw new TemplateError(
        "TEMPLATE_NOT_FOUND",
        `Template not found: ${id}`,
      );
    return configTemplateSchema.parse({ ...stored, builtIn: false });
  }
  async function create(template: ConfigTemplate) {
    await client.createTemplate(template);
    return template;
  }
  async function update(id: string, patch: TemplatePatch) {
    assertMutable(id);
    const existing = await get(id);
    const next = configTemplateSchema.parse({
      ...existing,
      ...structuredClone(patch),
      id,
      builtIn: false,
    });
    await client.updateTemplate(next);
    return next;
  }
  return {
    async list(terminal) {
      const stored = await client.listTemplates(terminal);
      return [
        ...builtinTemplates.map((template) => structuredClone(template)),
        ...stored.map((template) =>
          configTemplateSchema.parse({ ...template, builtIn: false }),
        ),
      ].filter((template) => matches(template, terminal));
    },
    get,
    async createFromProject(project, name, description = "") {
      return create(
        personal({
          name,
          description,
          terminal: project.terminal,
          shared: project.shared,
          // Terminal-specific lines (keybinds, includes, unknown settings) are not
          // part of a template: generated source never re-emits overrides.
          overrides: {},
        }),
      );
    },
    async duplicate(id, name) {
      const source = await get(id);
      return create(
        personal({
          name,
          description: source.description,
          terminal: source.terminal,
          shared: source.shared,
          overrides: source.overrides,
          attribution: source.attribution,
        }),
      );
    },
    rename: (id, name) => update(id, { name }),
    update,
    async remove(id) {
      assertMutable(id);
      await get(id);
      await client.deleteTemplate(id);
    },
    async exportBundle(ids) {
      const templates = await Promise.all(ids.map(get));
      return JSON.stringify(
        {
          format: TEMPLATE_BUNDLE_FORMAT,
          version: 1,
          templates: templates.map((template) => ({
            name: template.name,
            description: template.description,
            terminal: template.terminal,
            shared: template.shared,
            overrides: template.overrides,
            attribution: template.attribution,
          })),
        },
        null,
        2,
      );
    },
    async importBundle(json) {
      let parsed: z.infer<typeof bundleSchema>;
      try {
        parsed = bundleSchema.parse(JSON.parse(json));
      } catch (error) {
        throw new TemplateError(
          "INVALID_TEMPLATE_BUNDLE",
          `Not a valid template bundle: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      // Imports are always new personal templates; ids and the built-in flag are never trusted.
      const imported = parsed.templates.map(personal);
      const created: ConfigTemplate[] = [];
      try {
        for (const template of imported) {
          await client.createTemplate(template);
          created.push(template);
        }
      } catch (error) {
        // Best effort: do not leave half a bundle behind.
        await Promise.allSettled(
          created.map((template) => client.deleteTemplate(template.id)),
        );
        throw error;
      }
      return imported;
    },
  };
}
