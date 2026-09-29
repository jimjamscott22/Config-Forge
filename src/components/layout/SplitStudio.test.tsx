import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { makeProject } from "../../services/project-service";
import { SplitStudio } from "./SplitStudio";

afterEach(() => vi.unstubAllGlobals());
const project = () =>
  makeProject({
    name: "Daily config",
    terminal: "ghostty",
    source: "# preserve me\nfont-size = 13\nfuture-setting = keep\n",
  });

test("desktop studio exposes source and controls without allowing live writes", async () => {
  render(
    <SplitStudio project={project()} onOpen={() => {}} onHome={() => {}} />,
  );
  expect(screen.getByRole("heading", { name: "Daily config" })).toBeVisible();
  expect(screen.getByLabelText("Visual controls")).toBeVisible();
  expect(screen.getByText(/# preserve me/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Apply config" })).toBeDisabled();
  screen.getByRole("tab", { name: "Source" }).focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "Validation" })).toHaveFocus();
  expect(screen.getByText("Internal checks passed.")).toBeVisible();
  await userEvent.keyboard("{Home}");
  expect(screen.getByRole("tab", { name: "Preview" })).toHaveFocus();
});

test("narrow studio has four keyboard-operable tabs and preserved validation warnings", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const draft = makeProject({
    name: "Malformed",
    terminal: "ghostty",
    source: "font-size ???\n",
  });
  render(<SplitStudio project={draft} onOpen={() => {}} onHome={() => {}} />);
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  await userEvent.click(screen.getByRole("tab", { name: "Controls" }));
  expect(
    screen.getByRole("heading", { name: "Config overview" }),
  ).toBeVisible();
  await userEvent.keyboard("{End}");
  expect(screen.getByRole("tab", { name: /Validation/ })).toHaveFocus();
  expect(screen.getByText(/line 1/)).toBeVisible();
  expect(screen.getByRole("tabpanel", { name: /Validation/ })).toBeVisible();
});
