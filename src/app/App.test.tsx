import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { makeProject } from "../services/project-service";
import { createProjectStore } from "../state/project-store";
import { makeProjectClient } from "../test/fixtures/project-client";
import { App } from "./App";

afterEach(() => vi.restoreAllMocks());
function setup() {
  const { client, projects } = makeProjectClient();
  const store = createProjectStore(client);
  render(<App store={store} />);
  return { client, projects, store, user: userEvent.setup() };
}
async function nameDraft(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.clear(screen.getByLabelText("Project name"));
  await user.type(screen.getByLabelText("Project name"), name);
}

describe("App", () => {
  test("creates a terminal draft, returns home, and resumes without fake persistence", async () => {
    const { store, client, user } = setup();
    expect(screen.getByRole("heading", { name: "Config Forge" })).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Create a Kitty config" }),
    );
    expect(screen.getByLabelText("Terminal")).toHaveValue("kitty");
    await nameDraft(user, "My Kitty");
    await user.click(screen.getByRole("button", { name: "Open draft" }));
    expect(screen.getByRole("heading", { name: "My Kitty" })).toBeVisible();
    expect(store.getState().current?.terminal).toBe("kitty");
    expect(client.createProject).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Config Forge home" }));
    await user.click(screen.getByRole("button", { name: "Resume draft" }));
    expect(screen.getByRole("heading", { name: "My Kitty" })).toBeVisible();
  });

  test("imports source through the adapter and preserves comments and unknown settings", async () => {
    const { store, user } = setup();
    await user.click(
      screen.getByRole("button", { name: "Import Existing Config" }),
    );
    await nameDraft(user, "Imported config");
    const source =
      "# personal comment\nfont-size = 14\nfuture-setting = untouched\n";
    fireEvent.change(screen.getByLabelText("Configuration source"), {
      target: { value: source },
    });
    await user.click(screen.getByRole("button", { name: "Open draft" }));
    expect(screen.getByText(/# personal comment/)).toBeVisible();
    expect(store.getState().current?.shared.font.size).toBe(14);
    expect(
      store
        .getState()
        .current?.document.some((node) => node.kind === "unknown-setting"),
    ).toBe(true);
  });

  test("invalid imports show an error and never replace the current project", async () => {
    const { store, user } = setup();
    await user.click(
      screen.getByRole("button", { name: "Import Existing Config" }),
    );
    await user.selectOptions(screen.getByLabelText("Terminal"), "alacritty");
    fireEvent.change(screen.getByLabelText("Configuration source"), {
      target: { value: "[broken" },
    });
    await user.click(screen.getByRole("button", { name: "Open draft" }));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(store.getState().current).toBeNull();
  });

  test("cancelling draft replacement preserves the original; confirming replaces it", async () => {
    const { store, user } = setup();
    await user.click(screen.getByRole("button", { name: "Create New Config" }));
    await nameDraft(user, "First");
    await user.click(screen.getByRole("button", { name: "Open draft" }));
    await user.click(screen.getByRole("button", { name: "Config Forge home" }));
    await user.click(screen.getByRole("button", { name: "Create New Config" }));
    await nameDraft(user, "Second");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(screen.getByRole("button", { name: "Open draft" }));
    expect(store.getState().current?.name).toBe("First");
    expect(
      screen.getByRole("heading", { name: "Create a config" }),
    ).toBeVisible();
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Open draft" }));
    expect(store.getState().current?.name).toBe("Second");
  });

  test("recent projects use the project store and open failures stay visible", async () => {
    const { client, projects } = makeProjectClient();
    const saved = makeProject({ name: "Saved Ghostty", terminal: "ghostty" });
    projects.set(saved.id, saved);
    const store = createProjectStore(client);
    store.setState({ projects: [saved] });
    client.getProject.mockRejectedValue(new Error("Storage unavailable"));
    render(<App store={store} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Saved Ghostty/ }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Storage unavailable",
    );
    expect(store.getState().current).toBeNull();
    client.getProject.mockResolvedValue(saved);
    await userEvent.click(
      screen.getByRole("button", { name: /Saved Ghostty/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Saved Ghostty" }),
    ).toBeVisible();
    expect(client.listSnapshots).toHaveBeenCalledWith(saved.id);
  });

  test("detection failure is explicit and does not block draft creation", async () => {
    render(
      <App
        store={createProjectStore(makeProjectClient().client)}
        loadInstallations={async () => {
          throw new Error("Detection unavailable");
        }}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Detection unavailable",
    );
    expect(
      screen.getByRole("button", { name: "Create New Config" }),
    ).toBeEnabled();
  });

  test("provided templates create a draft for the chosen terminal", async () => {
    const project = makeProject({
      name: "Starter",
      terminal: "ghostty",
      source: "font-size = 18\n",
    });
    const template = {
      id: "starter",
      name: "Warm starter",
      description: "A calm palette",
      builtIn: true,
      terminal: "portable" as const,
      shared: project.shared,
      overrides: {},
    };
    const store = createProjectStore(makeProjectClient().client);
    render(<App store={store} templates={[template]} />);
    await userEvent.click(screen.getByRole("button", { name: /Warm starter/ }));
    await userEvent.selectOptions(screen.getByLabelText("Terminal"), "kitty");
    await userEvent.click(screen.getByRole("button", { name: "Open draft" }));
    await waitFor(() =>
      expect(store.getState().current?.shared.font.size).toBe(18),
    );
    expect(store.getState().current?.terminal).toBe("kitty");
  });
});

test("visual edits update the current draft and source while preserving its document, then survive resume", async () => {
  const { client } = makeProjectClient();
  const store = createProjectStore(client);
  const project = makeProject({
    name: "Editable",
    terminal: "ghostty",
    source: "# keep\nfont-size = 14\nfuture-option = yes\n",
  });
  store.getState().startDraft(project);
  render(<App store={store} />);
  await userEvent.click(screen.getByRole("button", { name: "Resume draft" }));
  fireEvent.change(screen.getByLabelText("Font size (pt)"), {
    target: { value: "18" },
  });
  expect(store.getState().current?.shared.font.size).toBe(18);
  expect(store.getState().current?.document).toEqual(project.document);
  expect(store.getState().current?.overrides).toEqual(project.overrides);
  expect(store.getState().dirty).toBe(true);
  expect(screen.getByText(/font-size = 18/)).toBeVisible();
  expect(client.saveProject).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Config Forge home" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Resume draft" }));
  expect(screen.getByLabelText("Font size (pt)")).toHaveValue("18");
  expect(
    screen.getByText(/future-option = yes/, { selector: ".config-source" }),
  ).toBeVisible();
});
