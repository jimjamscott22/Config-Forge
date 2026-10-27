import { expect, test, vi } from "vitest";
import { createProject, makeProject } from "../services/project-service";
import { makeProjectClient } from "../test/fixtures/project-client";
import { createProjectStore } from "./project-store";

test("opens, edits, saves, and refreshes persisted projects", async () => {
  const { client } = makeProjectClient();
  const project = await createProject(
    { name: "Daily", terminal: "ghostty" },
    client,
  );
  const store = createProjectStore(client);
  await store.getState().refresh();
  await store.getState().open(project.id);
  store.getState().edit({ ...project, name: "Renamed" });
  expect(store.getState().dirty).toBe(true);
  await store.getState().save();
  expect(store.getState()).toMatchObject({
    dirty: false,
    busy: false,
    error: null,
    current: { name: "Renamed" },
  });
});

test("failed saves retain unsaved changes and surface the error", async () => {
  const { client } = makeProjectClient();
  const project = await createProject(
    { name: "Daily", terminal: "ghostty" },
    client,
  );
  const store = createProjectStore(client);
  await store.getState().open(project.id);
  store.getState().edit({ ...project, name: "Unsaved" });
  client.saveProject.mockRejectedValue(new Error("database unavailable"));
  await expect(store.getState().save()).rejects.toThrow("database unavailable");
  expect(store.getState()).toMatchObject({
    dirty: true,
    busy: false,
    error: "database unavailable",
    current: { name: "Unsaved" },
  });
});

test("edits made while saving are preserved and remain dirty", async () => {
  const { client } = makeProjectClient();
  const project = await createProject(
    { name: "Daily", terminal: "ghostty" },
    client,
  );
  const store = createProjectStore(client);
  await store.getState().open(project.id);
  store.getState().edit({ ...project, name: "First edit" });
  let finish: () => void = () => {
    throw new Error("Save has not started");
  };
  client.saveProject.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const saving = store.getState().save();
  store.getState().edit({ ...project, name: "Second edit" });
  finish();
  await saving;
  expect(store.getState()).toMatchObject({
    dirty: true,
    current: { name: "Second edit" },
  });
  expect(store.getState().projects.at(0)?.name).toBe("First edit");
});

test("opening another project cannot discard dirty state and failed opens retain current project", async () => {
  const { client } = makeProjectClient();
  const project = await createProject(
    { name: "Daily", terminal: "ghostty" },
    client,
  );
  const store = createProjectStore(client);
  await store.getState().open(project.id);
  store.getState().edit({ ...project, name: "Unsaved" });
  await expect(store.getState().open("missing")).rejects.toThrow(
    "Save or discard",
  );
  expect(store.getState().current?.name).toBe("Unsaved");
  expect(() =>
    store.getState().edit(makeProject({ name: "Other", terminal: "kitty" })),
  ).toThrow("different project");
});

test("concurrent persistence operations are rejected", async () => {
  const { client } = makeProjectClient();
  const project = await createProject(
    { name: "Daily", terminal: "ghostty" },
    client,
  );
  const store = createProjectStore(client);
  client.listProjects.mockImplementation(() => new Promise(() => {}));
  void store.getState().refresh();
  await expect(store.getState().open(project.id)).rejects.toThrow(
    "already running",
  );
  expect(client.getProject).not.toHaveBeenCalled();
  vi.clearAllMocks();
});

test("edits while opening another project are preserved", async () => {
  const { client } = makeProjectClient();
  const first = await createProject(
    { name: "First", terminal: "ghostty" },
    client,
  );
  const second = await createProject(
    { name: "Second", terminal: "kitty" },
    client,
  );
  const store = createProjectStore(client);
  await store.getState().open(first.id);
  let finish: (project: typeof second) => void = () => {
    throw new Error("Open not started");
  };
  client.getProject.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const opening = store.getState().open(second.id);
  store.getState().edit({ ...first, name: "Unsaved" });
  finish(second);
  await expect(opening).rejects.toThrow("Project changed while opening");
  expect(store.getState()).toMatchObject({
    dirty: true,
    current: { id: first.id, name: "Unsaved" },
  });
});

test("session drafts require confirmation before replacement and do not pretend to persist", () => {
  const { client } = makeProjectClient();
  const store = createProjectStore(client);
  const first = makeProject({ name: "First", terminal: "ghostty" });
  const second = makeProject({ name: "Second", terminal: "kitty" });
  store.getState().startDraft(first);
  expect(store.getState()).toMatchObject({
    current: first,
    dirty: true,
    projects: [],
    snapshots: [],
  });
  expect(() => store.getState().startDraft(second)).toThrow(
    "Confirm replacement",
  );
  expect(store.getState().current).toEqual(first);
  store.getState().startDraft(second, true);
  expect(store.getState().current).toEqual(second);
  expect(client.createProject).not.toHaveBeenCalled();
});

test("a new draft is created on first save and updated afterwards", async () => {
  const { client, projects } = makeProjectClient();
  const store = createProjectStore(client);
  const draft = makeProject({ name: "Draft", terminal: "kitty" });
  store.getState().startDraft(draft);
  expect(store.getState().persisted).toBe(false);

  await store.getState().save();
  expect(client.createProject).toHaveBeenCalledTimes(1);
  expect(client.saveProject).not.toHaveBeenCalled();
  expect(store.getState()).toMatchObject({ persisted: true, dirty: false });
  expect(projects.has(draft.id)).toBe(true);

  store.getState().edit({ ...store.getState().current!, name: "Draft 2" });
  await store.getState().save();
  expect(client.saveProject).toHaveBeenCalledTimes(1);
  expect(client.createProject).toHaveBeenCalledTimes(1);
});

test("adopting a service-written project refreshes lists and clears dirty state", async () => {
  const { client } = makeProjectClient();
  const original = await createProject(
    { name: "Daily", terminal: "ghostty" },
    client,
  );
  const store = createProjectStore(client);
  await store.getState().open(original.id);
  store.getState().edit({ ...original, name: "Unsaved" });
  const restored = { ...original, name: "Restored" };
  client.saveProject(restored);

  await store.getState().adopt(restored);

  expect(store.getState()).toMatchObject({
    dirty: false,
    persisted: true,
    current: { name: "Restored" },
  });
  expect(store.getState().projects.map((item) => item.name)).toEqual([
    "Restored",
  ]);
});

test("adopting after the open project changed mid-flight keeps the newer state", async () => {
  const { client } = makeProjectClient();
  const original = await createProject(
    { name: "Daily", terminal: "ghostty" },
    client,
  );
  const other = await createProject(
    { name: "Other", terminal: "kitty" },
    client,
  );
  const store = createProjectStore(client);
  await store.getState().open(original.id);
  const pending = store.getState().adopt({ ...original, name: "Restored" });
  // Simulates the user switching projects while the restore round trip runs.
  store.setState({ current: other });

  await expect(pending).rejects.toThrow("changed while it was being restored");
  expect(store.getState().current?.name).toBe("Other");
});
