import { describe, expect, test } from "vitest";
import { getAdapter } from "../adapters/registry";
import { makeProjectClient } from "../test/fixtures/project-client";
import {
  createProject,
  importProject,
  saveProject,
  createSnapshot,
  restoreSnapshot,
  exportProject,
  listProjects,
  listSnapshots,
  translateAndSaveProject,
} from "./project-service";

const source =
  "# keep this comment\nfont-size = 13\nfuture-setting = preserved\n";
describe("project and history services", () => {
  test("creates, imports, saves and lists full preserved documents", async () => {
    const { client } = makeProjectClient();
    const empty = await createProject(
      { name: "New", terminal: "kitty" },
      client,
    );
    expect(empty.sourcePath).toBeNull();
    const project = await importProject(
      { name: "Imported", terminal: "ghostty", source, sourcePath: "/config" },
      client,
    );
    const saved = await saveProject({ ...project, name: "Renamed" }, client);
    expect(saved.document).toEqual(project.document);
    expect(getAdapter("ghostty").generate(saved).source).toBe(source);
    expect(await listProjects(client)).toContainEqual(saved);
    await expect(
      createProject({ name: "", terminal: "kitty" }, client),
    ).rejects.toThrow();
  });

  test("snapshots the unsaved draft before import replacement and restores all preserved content", async () => {
    const { client } = makeProjectClient();
    const original = await importProject(
      { name: "Original", terminal: "ghostty", source },
      client,
    );
    const current = {
      ...original,
      name: "Unsaved name",
      sourcePath: "/source",
      destinationPath: "/live/target",
    };
    const replaced = await importProject(
      { name: "Replacement", terminal: "ghostty", source: "font-size = 20\n" },
      client,
      current,
    );
    const snapshots = await listSnapshots(current.id, client);
    expect(snapshots[0]).toMatchObject({
      reason: "before-import-replacement",
      project: current,
    });
    expect(client.createSnapshot).toHaveBeenCalledWith(snapshots[0], 20);
    expect(replaced.id).toBe(current.id);
    expect(replaced.sourcePath).toBe("/source");
    expect(replaced.destinationPath).toBe("/live/target");
    const restored = await restoreSnapshot(
      replaced,
      snapshots.at(0)?.id ?? "missing",
      client,
    );
    expect(restored.document).toEqual(current.document);
    expect(restored.name).toBe("Unsaved name");
    expect((await listSnapshots(current.id, client))[1]).toMatchObject({
      reason: "before-restore",
      project: replaced,
    });
  });

  test("retains named labels and refuses cross-project restores", async () => {
    const { client } = makeProjectClient();
    const first = await createProject(
      { name: "First", terminal: "ghostty" },
      client,
    );
    const second = await createProject(
      { name: "Second", terminal: "kitty" },
      client,
    );
    const named = await createSnapshot(
      first,
      { kind: "named", label: "Favorite" },
      client,
    );
    expect(named.label).toBe("Favorite");
    expect(named.reason).toBeNull();
    client.saveProject.mockClear();
    await expect(restoreSnapshot(second, named.id, client)).rejects.toThrow(
      "another project",
    );
    expect(client.saveProject).not.toHaveBeenCalled();
  });

  test("snapshot failures stop destructive operations", async () => {
    const { client } = makeProjectClient();
    const original = await createProject(
      { name: "Original", terminal: "ghostty" },
      client,
    );
    client.createSnapshot.mockRejectedValue(new Error("disk full"));
    await expect(
      importProject(
        { name: "Replacement", terminal: "ghostty", source },
        client,
        original,
      ),
    ).rejects.toThrow("disk full");
    expect(client.saveProject).not.toHaveBeenCalled();
  });

  test("snapshots before translation and creates a distinct destination", async () => {
    const { client } = makeProjectClient();
    const original = await importProject(
      { name: "Original", terminal: "ghostty", source },
      client,
    );
    const translated = await translateAndSaveProject(
      original,
      "kitty",
      "Kitty",
      client,
    );
    expect(translated.project.id).not.toBe(original.id);
    expect(client.createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "before-translation",
        project: original,
      }),
      20,
    );
    expect(
      client.createSnapshot.mock.invocationCallOrder[0] ?? Infinity,
    ).toBeLessThan(client.createProject.mock.invocationCallOrder[1] ?? 0);
  });

  test("exports through the adapter without modifying history or a live path", async () => {
    const { client } = makeProjectClient();
    const project = await importProject(
      {
        name: "Original",
        terminal: "ghostty",
        source,
        sourcePath: "/live/config",
      },
      client,
    );
    await exportProject(project, "/export/config", client);
    expect(client.exportConfig).toHaveBeenCalledWith("/export/config", source);
    expect(client.createSnapshot).not.toHaveBeenCalled();
    await expect(
      exportProject(project, "/live/config", client),
    ).rejects.toThrow("Apply");
  });
});
