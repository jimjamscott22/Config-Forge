import { vi } from "vitest";
import type { ConfigTemplate } from "../../domain/template";
import type { TemplateClient } from "../../services/tauri-client";

export function makeTemplateClient() {
  const templates = new Map<string, ConfigTemplate>();
  const client = {
    listTemplates: vi.fn(async (terminal?: string) =>
      [...templates.values()].filter(
        (template) =>
          !terminal ||
          template.terminal === "portable" ||
          template.terminal === terminal,
      ),
    ),
    getTemplate: vi.fn(async (id: string) => templates.get(id) ?? null),
    createTemplate: vi.fn(async (template: ConfigTemplate) => {
      templates.set(template.id, structuredClone(template));
    }),
    updateTemplate: vi.fn(async (template: ConfigTemplate) => {
      if (!templates.has(template.id)) throw new Error("missing");
      templates.set(template.id, structuredClone(template));
    }),
    deleteTemplate: vi.fn(async (id: string) => {
      templates.delete(id);
    }),
  } satisfies TemplateClient;
  return { client, templates };
}
