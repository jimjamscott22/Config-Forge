import { createStore } from "zustand/vanilla";
import type { TerminalProject } from "../domain/project";
import type { ProjectSnapshot } from "../domain/snapshot";
import {
  getProject,
  listProjects,
  listSnapshots,
  saveProject,
} from "../services/project-service";
import { projectClient, type ProjectClient } from "../services/tauri-client";

export interface ProjectStore {
  projects: TerminalProject[];
  current: TerminalProject | null;
  snapshots: ProjectSnapshot[];
  dirty: boolean;
  busy: boolean;
  error: string | null;
  refresh(): Promise<void>;
  open(id: string): Promise<void>;
  edit(project: TerminalProject): void;
  save(): Promise<void>;
}

export function createProjectStore(client: ProjectClient = projectClient) {
  return createStore<ProjectStore>()((set, get) => {
    async function run(action: () => Promise<void>) {
      if (get().busy)
        throw new Error("A project operation is already running.");
      set({ busy: true, error: null });
      try {
        await action();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      } finally {
        set({ busy: false });
      }
    }
    return {
      projects: [],
      current: null,
      snapshots: [],
      dirty: false,
      busy: false,
      error: null,
      refresh: () =>
        run(async () => {
          set({ projects: await listProjects(client) });
        }),
      open: (id) =>
        run(async () => {
          if (get().dirty)
            throw new Error(
              "Save or discard changes before opening another project.",
            );
          const previous = get().current;
          const [current, snapshots] = await Promise.all([
            getProject(id, client),
            listSnapshots(id, client),
          ]);
          if (get().current !== previous || get().dirty) {
            throw new Error(
              "Project changed while opening; keep or save your edits first.",
            );
          }
          set({ current, snapshots, dirty: false });
        }),
      edit: (project) => {
        if (!get().current || project.id !== get().current?.id)
          throw new Error("Cannot edit a different project.");
        set({ current: structuredClone(project), dirty: true, error: null });
      },
      save: () =>
        run(async () => {
          const current = get().current;
          if (!current) throw new Error("No project is open.");
          const saved = await saveProject(current, client);
          set((state) => ({
            projects: [
              saved,
              ...state.projects.filter((project) => project.id !== saved.id),
            ],
            current: state.current === current ? saved : state.current,
            dirty: state.current !== current,
          }));
        }),
    };
  });
}
export const projectStore = createProjectStore();
