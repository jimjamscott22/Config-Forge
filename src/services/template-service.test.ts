import { describe, expect, test } from "vitest";
import { getAdapter } from "../adapters/registry";
import type { ConfigTemplate } from "../domain/template";
import { makeProjectClient } from "../test/fixtures/project-client";
import { makeTemplateClient } from "../test/fixtures/template-client";
import { builtinTemplates } from "../templates/builtins";
import { makeProject } from "./project-service";
import {
  applyTemplate,
  projectFromTemplate,
  createProjectFromTemplate,
  createTemplateService,
} from "./template-service";
import { validateProject } from "./validation-service";

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

describe("template catalog and personal templates", () => {
  function makeTemplateService() {
    const { client, templates } = makeTemplateClient();
    return { service: createTemplateService(client), client, templates };
  }

  test("cannot overwrite or delete a built-in template", async () => {
    const { service, client } = makeTemplateService();
    await expect(
      service.update("builtin-modern-dark", { name: "Changed" }),
    ).rejects.toMatchObject({ code: "BUILTIN_TEMPLATE_IMMUTABLE" });
    await expect(service.remove("builtin-modern-dark")).rejects.toMatchObject({
      code: "BUILTIN_TEMPLATE_IMMUTABLE",
    });
    expect(client.updateTemplate).not.toHaveBeenCalled();
    expect(client.deleteTemplate).not.toHaveBeenCalled();
  });

  test("duplicates a built-in as an independent personal template", async () => {
    const { service, templates } = makeTemplateService();
    const copy = await service.duplicate(
      "builtin-modern-dark",
      "My Modern Dark",
    );

    expect(copy.builtIn).toBe(false);
    expect(copy.name).toBe("My Modern Dark");
    expect(copy.id).not.toBe("builtin-modern-dark");
    expect(templates.has(copy.id)).toBe(true);
    const original = await service.get("builtin-modern-dark");
    expect(copy.shared).toEqual(original.shared);
    copy.shared.font.size = 99;
    expect(
      (await service.get("builtin-modern-dark")).shared.font.size,
    ).not.toBe(99);
  });

  test("lists built-ins first and filters by terminal", async () => {
    const { service } = makeTemplateService();
    const kittyProject = makeProject({
      name: "K",
      terminal: "kitty",
      source: "font_size 14\n",
    });
    const saved = await service.createFromProject(kittyProject, "Kitty setup");

    const all = await service.list();
    expect(all.slice(0, builtinTemplates.length).every((t) => t.builtIn)).toBe(
      true,
    );
    expect(all.at(-1)?.id).toBe(saved.id);
    expect((await service.list("ghostty")).map((t) => t.id)).not.toContain(
      saved.id,
    );
    expect((await service.list("kitty")).map((t) => t.id)).toContain(saved.id);
  });

  test("renames, updates, and deletes personal templates", async () => {
    const { service, templates } = makeTemplateService();
    const copy = await service.duplicate("builtin-minimal", "Mine");
    expect((await service.rename(copy.id, "  Renamed ")).name).toBe("Renamed");
    await expect(service.rename(copy.id, "   ")).rejects.toThrow();
    expect(templates.get(copy.id)?.name).toBe("Renamed");
    await service.remove(copy.id);
    expect(templates.size).toBe(0);
    await expect(service.rename(copy.id, "x")).rejects.toMatchObject({
      code: "TEMPLATE_NOT_FOUND",
    });
  });

  test("exports and imports a validated bundle as new personal templates", async () => {
    const { service, templates } = makeTemplateService();
    const json = await service.exportBundle([
      "builtin-retro-green",
      "builtin-blank",
    ]);
    const imported = await service.importBundle(json);

    expect(imported).toHaveLength(2);
    expect(
      imported.every((t) => !t.builtIn && !t.id.startsWith("builtin-")),
    ).toBe(true);
    expect(imported[0]?.shared).toEqual(
      (await service.get("builtin-retro-green")).shared,
    );
    expect(templates.size).toBe(2);
  });

  test("rejects malformed bundles without persisting anything", async () => {
    const { service, client } = makeTemplateService();
    for (const bad of [
      "not json",
      "{}",
      JSON.stringify({
        format: "config-forge-templates",
        version: 2,
        templates: [],
      }),
      JSON.stringify({
        format: "config-forge-templates",
        version: 1,
        templates: [
          {
            name: "Bad",
            description: "",
            terminal: "ghostty",
            shared: { font: {} },
            overrides: {},
          },
        ],
      }),
    ]) {
      await expect(service.importBundle(bad)).rejects.toMatchObject({
        code: "INVALID_TEMPLATE_BUNDLE",
      });
    }
    expect(client.createTemplate).not.toHaveBeenCalled();
  });

  test("rejects bundles whose strings could inject config lines", async () => {
    const { service, client } = makeTemplateService();
    const bundle = JSON.parse(await service.exportBundle(["builtin-minimal"]));
    for (const key of [
      "family",
      "boldFamily",
      "italicFamily",
      "boldItalicFamily",
    ]) {
      bundle.templates[0].shared.font[key] =
        "Mono\ninitial-command = touch /tmp/pwned";
      await expect(
        service.importBundle(JSON.stringify(bundle)),
      ).rejects.toMatchObject({ code: "INVALID_TEMPLATE_BUNDLE" });
      bundle.templates[0].shared.font[key] = null;
    }
    expect(client.createTemplate).not.toHaveBeenCalled();
  });

  test("an imported bundle cannot claim to be built in", async () => {
    const { service } = makeTemplateService();
    const bundle = JSON.parse(await service.exportBundle(["builtin-minimal"]));
    bundle.templates[0].builtIn = true;
    bundle.templates[0].id = "builtin-minimal";
    const [imported] = await service.importBundle(JSON.stringify(bundle));
    expect(imported?.builtIn).toBe(false);
    expect(imported?.id).not.toBe("builtin-minimal");
  });
});

describe("built-in catalog", () => {
  test("ships the eight planned, uniquely identified, frozen templates", () => {
    expect(builtinTemplates.map((t) => t.name)).toEqual([
      "Blank",
      "Modern Dark",
      "Modern Light",
      "High Contrast Dark",
      "High Contrast Light",
      "Retro Green",
      "Presentation",
      "Minimal",
    ]);
    expect(new Set(builtinTemplates.map((t) => t.id)).size).toBe(8);
    expect(builtinTemplates.every((t) => t.builtIn && !t.attribution)).toBe(
      true,
    );
    expect(Object.isFrozen(builtinTemplates[1])).toBe(true);
    expect(Object.isFrozen(builtinTemplates[1]?.shared.colors)).toBe(true);
  });

  for (const terminal of ["ghostty", "kitty", "alacritty"] as const) {
    test(`every built-in generates a valid ${terminal} config`, () => {
      for (const template of builtinTemplates) {
        const project = projectFromTemplate(template, terminal, template.name);
        expect(
          validateProject(project).issues.filter((i) => i.severity === "error"),
          template.name,
        ).toEqual([]);
        expect(project.shared.colors.background).toBe(
          template.shared.colors.background,
        );
      }
    });
  }
});
