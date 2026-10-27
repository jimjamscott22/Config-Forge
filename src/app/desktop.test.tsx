import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { makeProject } from "../services/project-service";
import { createStudioWorkflows } from "../services/studio-workflows";
import { createProjectStore } from "../state/project-store";
import { makeProjectClient } from "../test/fixtures/project-client";
import { App } from "./App";
import type { StartupData } from "./startup";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: () => false,
}));

const paths = {
  dataDir: "/data",
  backupDir: "/data/backups",
  exportDir: "/data/exports",
};
const startupData: StartupData = {
  detectedTerminals: [
    {
      terminal: "ghostty",
      binaryPath: null,
      configPaths: ["/home/me/.config/ghostty/config"],
      version: null,
    },
  ],
  detectionError: null,
  recentProjects: [],
  templates: [],
  paths,
};

beforeEach(() => {
  // No installed terminal binaries: native validation reports "unavailable".
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue([]);
});

function setup(startup = vi.fn(async () => startupData)) {
  const { client, projects, snapshots } = makeProjectClient();
  const written = new Map<string, string>();
  client.applyConfig.mockImplementation(async (request) => {
    written.set(request.target, request.candidate);
    return {
      bytesWritten: new TextEncoder().encode(request.candidate).length,
      sha256: "hash",
    };
  });
  client.readTextFile.mockImplementation(
    async (path) => written.get(path) ?? "",
  );
  const store = createProjectStore(client);
  const user = userEvent.setup();
  render(
    <App
      store={store}
      startup={startup}
      workflows={createStudioWorkflows(paths, client)}
    />,
  );
  return { client, projects, snapshots, store, user, written, startup };
}

async function openSavedStudio(
  context: ReturnType<typeof setup>,
  name = "Daily",
) {
  const { user } = context;
  await user.click(
    await screen.findByRole("button", { name: "Create New Config" }),
  );
  await user.clear(screen.getByLabelText("Project name"));
  await user.type(screen.getByLabelText("Project name"), name);
  await user.click(screen.getByRole("button", { name: "Open draft" }));
  await user.click(screen.getByRole("button", { name: "Save project" }));
  await waitFor(() =>
    expect(
      screen.getByText("Saved", { selector: ".draft-badge" }),
    ).toBeVisible(),
  );
}

describe("desktop startup", () => {
  test("shows a blocking error instead of fake success and can retry", async () => {
    const startup = vi
      .fn<() => Promise<StartupData>>()
      .mockRejectedValueOnce(new Error("database migration failed: boom"))
      .mockResolvedValue(startupData);
    const { user } = setup(startup);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "database migration failed: boom",
    );
    expect(
      screen.queryByRole("button", { name: "Create New Config" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: "Create New Config" }),
    ).toBeVisible();
    expect(startup).toHaveBeenCalledTimes(2);
  });

  test("lists projects from startup data", async () => {
    const saved = makeProject({ name: "From database", terminal: "kitty" });
    setup(vi.fn(async () => ({ ...startupData, recentProjects: [saved] })));
    expect(await screen.findByText("From database")).toBeVisible();
  });

  test("reports a detection failure without blocking persistence", async () => {
    setup(
      vi.fn(async () => ({
        ...startupData,
        detectedTerminals: [],
        detectionError: "PATH unreadable",
      })),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Terminal detection failed: PATH unreadable",
    );
    expect(
      screen.getByRole("button", { name: "Create New Config" }),
    ).toBeVisible();
  });
});

describe("persistent studio", () => {
  test("saves a new draft with create, then updates with save", async () => {
    const context = setup();
    await openSavedStudio(context);
    const { client, projects, store } = context;
    expect(client.createProject).toHaveBeenCalledTimes(1);
    expect(client.saveProject).not.toHaveBeenCalled();
    expect(projects.size).toBe(1);

    const current = store.getState().current!;
    store.getState().edit({ ...current, name: "Renamed" });
    await context.user.click(
      screen.getByRole("button", { name: "Save project" }),
    );
    await waitFor(() => expect(client.saveProject).toHaveBeenCalledTimes(1));
    expect(projects.get(current.id)?.name).toBe("Renamed");
  });

  test("apply requires a saved project", async () => {
    const context = setup();
    await context.user.click(
      await screen.findByRole("button", { name: "Create New Config" }),
    );
    await context.user.click(
      screen.getByRole("button", { name: "Open draft" }),
    );
    expect(
      screen.getAllByText(/Save the project before/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Review changes" }),
    ).toBeDisabled();
  });

  test("apply shows the diff, snapshots, backs up, writes, verifies, and remembers the destination", async () => {
    const context = setup();
    await openSavedStudio(context);
    const { client, store, user, written } = context;
    client.readOptionalTextFile.mockResolvedValue("font-size = 9\n");
    client.inspectPath.mockResolvedValue({ exists: true, isSymlink: false });

    await user.clear(screen.getByLabelText("Destination path"));
    await user.type(
      screen.getByLabelText("Destination path"),
      "/home/me/.config/ghostty/config",
    );
    await user.click(screen.getByRole("button", { name: "Review changes" }));

    const apply = await screen.findByRole("button", { name: "Apply to file" });
    expect(apply).toBeDisabled();
    expect(client.applyConfig).not.toHaveBeenCalled();
    expect(
      screen.getByText("/data/backups/ghostty/" + store.getState().current!.id),
    ).toBeVisible();
    await user.click(screen.getByLabelText(/I reviewed this diff/));
    await user.click(apply);

    expect(await screen.findByText(/Applied to \/home\/me/)).toBeVisible();
    expect(client.createBackup).toHaveBeenCalledWith({
      target: "/home/me/.config/ghostty/config",
      backupRoot: `/data/backups/ghostty/${store.getState().current!.id}`,
    });
    expect(client.applyConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "/home/me/.config/ghostty/config",
        expectedSource: "font-size = 9\n",
      }),
    );
    expect(written.has("/home/me/.config/ghostty/config")).toBe(true);
    await waitFor(() =>
      expect(store.getState().current?.destinationPath).toBe(
        "/home/me/.config/ghostty/config",
      ),
    );
    expect(store.getState().dirty).toBe(false);
    expect(
      store
        .getState()
        .snapshots.some((item) => item.reason === "before-direct-apply"),
    ).toBe(true);
  });

  test("cancelling the review writes nothing", async () => {
    const context = setup();
    await openSavedStudio(context);
    const { client, user } = context;
    await user.clear(screen.getByLabelText("Destination path"));
    await user.type(
      screen.getByLabelText("Destination path"),
      "/tmp/new-config",
    );
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    await user.click(
      await screen.findByRole("button", { name: "Cancel apply" }),
    );
    expect(await screen.findByText(/Apply cancelled/)).toBeVisible();
    expect(client.applyConfig).not.toHaveBeenCalled();
    expect(client.createBackup).not.toHaveBeenCalled();
  });

  test("a new destination skips the backup and a symlink is refused before review", async () => {
    const context = setup();
    await openSavedStudio(context);
    const { client, user } = context;
    await user.clear(screen.getByLabelText("Destination path"));
    await user.type(screen.getByLabelText("Destination path"), "/tmp/link");
    client.inspectPath.mockResolvedValueOnce({ exists: true, isSymlink: true });
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("symbolic link");
    expect(client.applyConfig).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Destination path"));
    await user.type(
      screen.getByLabelText("Destination path"),
      "/tmp/new-config",
    );
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    await user.click(await screen.findByLabelText(/I reviewed this diff/));
    await user.click(screen.getByRole("button", { name: "Apply to file" }));
    expect(await screen.findByText(/No backup was needed/)).toBeVisible();
    expect(client.createBackup).not.toHaveBeenCalled();
  });

  test("a write failure is visible and does not report success", async () => {
    const context = setup();
    await openSavedStudio(context);
    const { client, user } = context;
    client.applyConfig.mockRejectedValue(
      new Error("destination changed since confirmation"),
    );
    await user.clear(screen.getByLabelText("Destination path"));
    await user.type(
      screen.getByLabelText("Destination path"),
      "/tmp/new-config",
    );
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    await user.click(await screen.findByLabelText(/I reviewed this diff/));
    await user.click(screen.getByRole("button", { name: "Apply to file" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "destination changed since confirmation",
    );
    expect(screen.queryByText(/Applied to/)).not.toBeInTheDocument();
  });

  test("exports to an explicit path and shows backend failures", async () => {
    const context = setup();
    await openSavedStudio(context);
    const { client, user } = context;
    await user.click(screen.getByRole("button", { name: "Export config" }));
    expect(
      await screen.findByText(/Exported 9 bytes to \/data\/exports\//),
    ).toBeVisible();
    expect(client.exportConfig).toHaveBeenCalledWith(
      expect.stringMatching(/^\/data\/exports\/.*-config$/),
      expect.any(String),
    );

    client.exportConfig.mockRejectedValueOnce(new Error("file exists"));
    await user.click(screen.getByRole("button", { name: "Export config" }));
    expect(await screen.findByText("file exists")).toBeVisible();
  });

  test("translation creates a new project with a report and leaves the source intact", async () => {
    const context = setup();
    await openSavedStudio(context);
    const { client, projects, store, user } = context;
    const source = structuredClone(store.getState().current!);
    await user.click(
      screen.getByRole("button", { name: "Translate to new project" }),
    );
    const report = await screen.findByRole("region", {
      name: "Translation report",
    });
    expect(within(report).getByText(/ghostty → kitty/)).toBeVisible();
    expect(projects.size).toBe(2);
    expect(projects.get(source.id)).toEqual(
      expect.objectContaining({ id: source.id, terminal: "ghostty" }),
    );
    expect(
      client.createSnapshot.mock.calls.some(
        ([snapshot]) => snapshot.reason === "before-translation",
      ),
    ).toBe(true);
    await user.click(
      screen.getByRole("button", { name: /Open “Daily \(kitty\)”/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Daily (kitty)" }),
    ).toBeVisible();
  });

  test("named snapshots can be created and restored after confirmation", async () => {
    const context = setup();
    await openSavedStudio(context);
    const { store, user } = context;
    await user.type(
      screen.getByLabelText("Snapshot name"),
      "Before experiment",
    );
    await user.click(
      screen.getByRole("button", { name: "Create named snapshot" }),
    );
    expect(
      await screen.findByText("Saved snapshot “Before experiment”."),
    ).toBeVisible();
    expect(store.getState().snapshots).toHaveLength(1);

    const current = store.getState().current!;
    store.getState().edit({ ...current, name: "Changed" });
    await user.click(screen.getByRole("button", { name: "Save project" }));
    await waitFor(() => expect(store.getState().dirty).toBe(false));

    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(
      screen.getByRole("button", { name: "Restore Before experiment" }),
    );
    expect(store.getState().current?.name).toBe("Changed");

    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await user.click(
      screen.getByRole("button", { name: "Restore Before experiment" }),
    );
    await waitFor(() => expect(store.getState().current?.name).toBe("Daily"));
    expect(
      store
        .getState()
        .snapshots.some((item) => item.reason === "before-restore"),
    ).toBe(true);
  });
});
