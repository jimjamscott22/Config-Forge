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
