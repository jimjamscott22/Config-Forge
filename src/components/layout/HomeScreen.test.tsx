import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { makeProject } from "../../services/project-service";
import { HomeScreen } from "./HomeScreen";

test("offers equal create and import actions and useful empty states", async () => {
  const onCreate = vi.fn();
  const onImport = vi.fn();
  render(<HomeScreen onCreate={onCreate} onImport={onImport} />);
  const create = screen.getByRole("button", { name: "Create New Config" });
  const importing = screen.getByRole("button", {
    name: "Import Existing Config",
  });
  expect(create).toBeEnabled();
  expect(importing).toBeEnabled();
  expect(create.className).toBe(importing.className);
  await userEvent.click(create);
  await userEvent.click(importing);
  expect(onCreate).toHaveBeenCalledOnce();
  expect(onImport).toHaveBeenCalledOnce();
  expect(screen.getByText("A clean workbench.")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Built-in templates" }),
  ).toBeVisible();
});

test("terminal cards are keyboard accessible and reflect actual detection", async () => {
  const onCreate = vi.fn();
  render(
    <HomeScreen
      detectionStatus="ready"
      installations={[
        {
          terminal: "ghostty",
          binaryPath: "/usr/bin/ghostty",
          configPaths: [],
          version: null,
        },
        {
          terminal: "kitty",
          binaryPath: null,
          configPaths: ["/config/kitty.conf"],
          version: null,
        },
      ]}
      onCreate={onCreate}
    />,
  );
  expect(screen.getByText("Installed")).toBeVisible();
  expect(screen.getByText("Config found")).toBeVisible();
  expect(screen.getByText("Not found")).toBeVisible();
  screen.getByRole("button", { name: "Create a Kitty config" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(onCreate).toHaveBeenCalledWith("kitty");
});

test("recent projects and a current draft invoke their own navigation actions", async () => {
  const project = makeProject({ name: "Saved project", terminal: "ghostty" });
  const onOpen = vi.fn();
  const onResume = vi.fn();
  render(
    <HomeScreen
      projects={[project]}
      current={{ ...project, name: "Current draft" }}
      onOpen={onOpen}
      onResume={onResume}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Saved project/ }));
  await userEvent.click(screen.getByRole("button", { name: "Resume draft" }));
  expect(onOpen).toHaveBeenCalledWith(project.id);
  expect(onResume).toHaveBeenCalledOnce();
});

test("provided templates are actionable and disabled during project operations", async () => {
  const project = makeProject({ name: "Starter", terminal: "ghostty" });
  const template = {
    id: "starter",
    name: "Warm starter",
    description: "A calm palette",
    builtIn: true,
    terminal: "ghostty" as const,
    shared: project.shared,
    overrides: {},
  };
  const onTemplate = vi.fn();
  const { rerender } = render(
    <HomeScreen templates={[template]} onTemplate={onTemplate} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Warm starter/ }));
  expect(onTemplate).toHaveBeenCalledWith(template);
  rerender(<HomeScreen templates={[template]} busy />);
  expect(
    screen.getByRole("button", { name: "Create New Config" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: /Warm starter/ })).toBeDisabled();
});
