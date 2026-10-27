import type { Page } from "@playwright/test";

export interface MockSeed {
  /** Files that already exist on the "disk", keyed by absolute path. */
  files?: Record<string, string>;
  /** Paths that are symbolic links. */
  symlinks?: string[];
}

export interface MockState {
  files: Record<string, string>;
  symlinks: string[];
  projects: Record<string, Record<string, unknown>>;
  snapshots: Record<string, Record<string, unknown>>;
  templates: Record<string, Record<string, unknown>>;
  /** Backups the app asked for, in order. */
  backups: Array<{ target: string; path: string; content: string }>;
  /** Command names in the order they were invoked. */
  calls: string[];
  failApplyWith: string | null;
}

/**
 * Stands in for the Rust backend so the desktop-only workflows (save, reopen,
 * apply, export, history) can be driven in a browser. State lives in
 * localStorage so a page reload behaves like reopening the app. Real write
 * safety is verified by `src-tauri/tests/safe_apply.rs`, not here.
 */
export async function installTauriMock(page: Page, seed: MockSeed = {}) {
  await page.addInitScript((initial) => {
    const KEY = "config-forge-e2e-mock";
    const stored = localStorage.getItem(KEY);
    const state: MockState = stored
      ? JSON.parse(stored)
      : {
          files: initial.files ?? {},
          symlinks: initial.symlinks ?? [],
          projects: {},
          snapshots: {},
          templates: {},
          backups: [],
          calls: [],
          failApplyWith: null,
        };
    const save = () => localStorage.setItem(KEY, JSON.stringify(state));
    const hash = (text: string) =>
      `mock-${text.length}-${[...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7)}`;
    const size = (text: string) => new TextEncoder().encode(text).length;
    // Handlers receive untyped IPC arguments, exactly like the real backend.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers: Record<string, (args: any) => unknown> = {
      detect_terminals: () => [
        {
          terminal: "ghostty",
          binaryPath: null,
          configPaths: ["/home/me/.config/ghostty/config"],
          version: null,
        },
        {
          terminal: "kitty",
          binaryPath: null,
          configPaths: ["/home/me/.config/kitty/kitty.conf"],
          version: null,
        },
        {
          terminal: "alacritty",
          binaryPath: null,
          configPaths: ["/home/me/.config/alacritty/alacritty.toml"],
          version: null,
        },
      ],
      get_app_paths: () => ({
        dataDir: "/data",
        backupDir: "/data/backups",
        exportDir: "/data/exports",
      }),
      list_projects: () => Object.values(state.projects),
      get_project: ({ id }) => state.projects[id] ?? null,
      create_project: ({ project }) => {
        if (state.projects[project.id]) throw "project already exists";
        state.projects[project.id] = project;
      },
      save_project: ({ project }) => {
        if (!state.projects[project.id])
          throw `project not found: ${project.id}`;
        state.projects[project.id] = project;
      },
      create_snapshot: ({ snapshot }) => {
        if (!state.projects[snapshot.projectId])
          throw "FOREIGN KEY constraint failed";
        state.snapshots[snapshot.id] = snapshot;
      },
      get_snapshot: ({ id }) => state.snapshots[id] ?? null,
      list_snapshots: ({ projectId }) =>
        Object.values(state.snapshots)
          .filter((item) => item.projectId === projectId)
          .reverse(),
      list_templates: () => Object.values(state.templates),
      get_template: ({ id }) => state.templates[id] ?? null,
      create_template: ({ template }) => {
        state.templates[template.id] = template;
      },
      update_template: ({ template }) => {
        state.templates[template.id] = template;
      },
      delete_template: ({ id }) => {
        delete state.templates[id];
      },
      inspect_path: ({ path }) => ({
        exists: path in state.files,
        isSymlink: state.symlinks.includes(path),
      }),
      read_text_file: ({ path }) => {
        if (!(path in state.files)) throw `file access failed: ${path}`;
        return state.files[path];
      },
      read_optional_text_file: ({ path }) => state.files[path] ?? null,
      export_config: ({ target, candidate }) => {
        if (target in state.files)
          throw `atomic write to ${target} failed: destination changed since confirmation`;
        state.files[target] = candidate;
        return { bytesWritten: size(candidate), sha256: hash(candidate) };
      },
      create_config_backup: ({ target, backupRoot }) => {
        const content = state.files[target];
        if (content === undefined) throw `backup of ${target} failed`;
        const path = `${backupRoot}/${state.backups.length}-${target.split("/").pop()}.bak`;
        state.files[path] = content;
        state.backups.push({ target, path, content });
        return { path, sha256: hash(content) };
      },
      apply_config: ({ request }) => {
        if (state.failApplyWith) throw state.failApplyWith;
        if (state.symlinks.includes(request.target))
          throw `refusing to write through symlink: ${request.target}`;
        const actual = state.files[request.target] ?? null;
        if (actual !== request.expectedSource)
          throw `atomic write to ${request.target} failed: destination changed since confirmation`;
        state.files[request.target] = request.candidate;
        return {
          bytesWritten: size(request.candidate),
          sha256: hash(request.candidate),
        };
      },
      stage_candidate: () => "/data/staging/id/candidate",
      remove_staged_candidate: () => undefined,
      validate_candidate: () => ({
        valid: true,
        nativeAvailable: false,
        issues: [],
      }),
    };
    const internals = {
      invoke: async (cmd: string, args: unknown) => {
        state.calls.push(cmd);
        const handler = handlers[cmd];
        if (!handler) throw `unknown command: ${cmd}`;
        try {
          return structuredClone(handler(args ?? {}));
        } finally {
          save();
        }
      },
      transformCallback: () => 0,
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
    };
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: internals,
      __configForgeMock: { state, save },
    });
    save();
  }, seed);
}

export async function readMockState(page: Page): Promise<MockState> {
  return page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("config-forge-e2e-mock") ?? "null",
      ) as MockState,
  );
}

export async function patchMockState(page: Page, patch: Partial<MockState>) {
  await page.evaluate((next) => {
    const mock = (
      window as unknown as {
        __configForgeMock: { state: object; save(): void };
      }
    ).__configForgeMock;
    Object.assign(mock.state, next);
    mock.save();
  }, patch);
}
