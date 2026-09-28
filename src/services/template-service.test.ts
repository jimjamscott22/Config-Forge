import { expect, test } from "vitest";
import { getAdapter } from "../adapters/registry";
import type { ConfigTemplate } from "../domain/template";
import { makeProjectClient } from "../test/fixtures/project-client";
import { makeProject } from "./project-service";
import {
  applyTemplate,
  projectFromTemplate,
  createProjectFromTemplate,
} from "./template-service";

function template(): ConfigTemplate {
  const project = makeProject({
    name: "Template",
    terminal: "ghostty",
    source: "font-size = 18\n",
  });
  return {
    id: "starter",
    name: "Starter",
    description: "",
    terminal: "ghostty",
    builtIn: true,
    shared: project.shared,
    overrides: project.overrides,
  };
}

test("template creation does not share mutable data or modify the template", async () => {
  const { client } = makeProjectClient();
  const starter = template();
  const original = structuredClone(starter);
  const project = await createProjectFromTemplate(
    starter,
    "ghostty",
    "New",
    client,
  );
  project.shared.font.size = 25;
  expect(starter).toEqual(original);
  expect(client.createProject).toHaveBeenCalledOnce();
});

test("template replacement snapshots and preserves project identity and paths", async () => {
  const { client } = makeProjectClient();
  const current = makeProject({
    name: "Current",
    terminal: "ghostty",
    source: "# custom\nfont-size = 12\n",
    sourcePath: "/source",
    destinationPath: "/target",
  });
  const result = await applyTemplate(current, template(), client);
  expect(result).toMatchObject({
    id: current.id,
    sourcePath: "/source",
    destinationPath: "/target",
    createdAt: current.createdAt,
  });
  expect(result.shared.font.size).toBe(18);
  expect(client.createSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: "before-template-replacement",
      project: current,
    }),
    20,
  );
});

test("terminal-specific templates require matching terminals; portable templates discard overrides", () => {
  expect(() => projectFromTemplate(template(), "kitty", "Kitty")).toThrow(
    "different terminal",
  );
  const portable = {
    ...template(),
    terminal: "portable" as const,
    overrides: { dangerous: "ignored" },
  };
  const project = projectFromTemplate(portable, "kitty", "Kitty");
  expect(project.overrides).not.toHaveProperty("dangerous");
  expect(getAdapter("kitty").generate(project).source).toContain(
    "font_size 18",
  );
});
