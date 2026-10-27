import { describe, expect, test, vi } from "vitest";
import { makeProject } from "../services/project-service";
import { makeProjectClient } from "../test/fixtures/project-client";
import { loadStartupData, type StartupDependencies } from "./startup";

const paths = {
  dataDir: "/data",
  backupDir: "/data/backups",
  exportDir: "/data/exports",
};

function setup(overrides: Partial<StartupDependencies> = {}) {
  const { client, projects } = makeProjectClient();
  const project = makeProject({ name: "Saved", terminal: "kitty" });
  projects.set(project.id, project);
  const deps: StartupDependencies = {
    detectTerminals: vi.fn(async () => [
      {
        terminal: "kitty" as const,
        binaryPath: "/usr/bin/kitty",
        configPaths: ["/home/me/.config/kitty/kitty.conf"],
        version: null,
      },
    ]),
    getAppPaths: vi.fn(async () => paths),
    projects: client,
    templates: {
      listTemplates: vi.fn(async () => []),
      getTemplate: vi.fn(),
      createTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
    },
    ...overrides,
  };
  return { deps, project };
}

describe("loadStartupData", () => {
  test("loads detection, recent projects, templates, and app paths", async () => {
    const { deps, project } = setup();
    const data = await loadStartupData(deps);
    expect(data.detectedTerminals).toHaveLength(1);
    expect(data.detectionError).toBeNull();
    expect(data.recentProjects.map((item) => item.id)).toEqual([project.id]);
    expect(data.paths).toEqual(paths);
  });

  test("skips stored projects that fail validation instead of failing startup", async () => {
    const { client } = makeProjectClient();
    const good = makeProject({ name: "Good", terminal: "kitty" });
    const bad = { ...makeProject({ name: "Bad", terminal: "kitty" }), id: "x" };
    client.listProjects.mockResolvedValue([good, bad]);
    const { deps } = setup({ projects: client });
    const data = await loadStartupData(deps);
    expect(data.recentProjects.map((item) => item.name)).toEqual(["Good"]);
    expect(data.skippedProjects).toBe(1);
  });

  test("keeps going with a recoverable error when only detection fails", async () => {
    const { deps } = setup({
      detectTerminals: vi.fn(async () => {
        throw new Error("PATH unreadable");
      }),
    });
    const data = await loadStartupData(deps);
    expect(data.detectionError).toBe("PATH unreadable");
    expect(data.detectedTerminals).toEqual([]);
    expect(data.recentProjects).toHaveLength(1);
  });

  test("rejects when the database is unavailable instead of faking an empty state", async () => {
    const { client } = makeProjectClient();
    client.listProjects.mockRejectedValue(new Error("database is locked"));
    const { deps } = setup({ projects: client });
    await expect(loadStartupData(deps)).rejects.toThrow("database is locked");
  });
});
