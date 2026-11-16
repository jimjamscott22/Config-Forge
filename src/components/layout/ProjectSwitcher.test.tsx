import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { makeProject } from "../../services/project-service";
import { ProjectSwitcher } from "./ProjectSwitcher";

const daily = makeProject({ name: "Daily", terminal: "ghostty" });
const work = makeProject({ name: "Work", terminal: "kitty" });

function setup(overrides: Partial<Parameters<typeof ProjectSwitcher>[0]> = {}) {
  const props = {
    current: daily,
    projects: [daily, work],
    busy: false,
    onOpen: vi.fn(),
    onHome: vi.fn(),
    ...overrides,
  };
  render(<ProjectSwitcher {...props} />);
  return props;
}

test("lists all projects with the current one marked", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: /Daily/ }));
  const items = screen.getAllByRole("menuitem");
  expect(items[0]).toHaveTextContent("Daily");
  expect(items[0]).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("menuitem", { name: /Work/ })).toBeEnabled();
});

test("opening another project calls onOpen and closes the menu", async () => {
  const props = setup();
  await userEvent.click(screen.getByRole("button", { name: /Daily/ }));
  await userEvent.click(screen.getByRole("menuitem", { name: /Work/ }));
  expect(props.onOpen).toHaveBeenCalledWith(work.id);
  expect(screen.queryByRole("menu")).toBeNull();
});

test("is disabled while busy", () => {
  setup({ busy: true });
  expect(screen.getByRole("button", { name: /Daily/ })).toBeDisabled();
});

test("Escape closes the menu and refocuses the trigger", async () => {
  setup();
  const trigger = screen.getByRole("button", { name: /Daily/ });
  await userEvent.click(trigger);
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(trigger).toHaveFocus();
});

test("offers save as template only when provided", async () => {
  const onSaveAsTemplate = vi.fn();
  setup({ onSaveAsTemplate });
  await userEvent.click(screen.getByRole("button", { name: /Daily/ }));
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Save as template" }),
  );
  expect(onSaveAsTemplate).toHaveBeenCalledWith(daily);
});

test("hides save as template when not provided", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: /Daily/ }));
  expect(
    screen.queryByRole("menuitem", { name: "Save as template" }),
  ).toBeNull();
  expect(
    screen.getByRole("menuitem", { name: "Back to workbench" }),
  ).toBeInTheDocument();
});
