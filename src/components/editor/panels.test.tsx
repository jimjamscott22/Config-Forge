import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { makeProject } from "../../services/project-service";
import { ValidationPanel } from "../validation/ValidationPanel";
import { DiffViewer } from "./DiffViewer";
import { UnmappedSettings } from "./UnmappedSettings";

test("diff viewer lists changes, destination details, and gates confirmation on errors", async () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <DiffViewer
      current={"a\nb\n"}
      candidate={"a\nc\n"}
      target={{
        path: "/home/me/.config/ghostty/config",
        isSymlink: true,
        backupDestination: "/backups/config.bak",
      }}
      confirmation={{ label: "Reviewed", checked: false, onChange }}
    />,
  );
  expect(screen.getByText("1 added · 1 removed · 1 unchanged")).toBeVisible();
  expect(screen.getByText("Added:")).toBeInTheDocument();
  expect(screen.getByText("/backups/config.bak")).toBeVisible();
  expect(screen.getByText(/refuses to write through symlinks/)).toBeVisible();
  await userEvent.click(screen.getByRole("checkbox", { name: "Reviewed" }));
  expect(onChange).toHaveBeenCalledWith(true);

  rerender(
    <DiffViewer
      current={null}
      candidate="a\n"
      blockingIssues={[
        { id: "x", severity: "error", code: "X", message: "Bad value" },
      ]}
      confirmation={{ label: "Reviewed", checked: false, onChange }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Bad value");
  expect(screen.getByRole("checkbox", { name: "Reviewed" })).toBeDisabled();
});

test("validation panel groups errors, warnings, and information", () => {
  render(
    <ValidationPanel
      issues={[
        { id: "1", severity: "info", code: "I", message: "FYI" },
        { id: "2", severity: "error", code: "E", message: "Broken" },
        {
          id: "3",
          severity: "warning",
          code: "W",
          message: "Odd",
          sourceLine: 4,
        },
      ]}
    />,
  );
  const headings = screen.getAllByRole("heading", { level: 3 });
  expect(headings.map((heading) => heading.textContent)).toEqual([
    "Errors (1)",
    "Warnings (1)",
    "Information (1)",
  ]);
  expect(screen.getByText("Needs attention")).toBeVisible();
  expect(screen.getByText(/warning · line 4/)).toBeVisible();
});

test("unmapped settings are grouped by kind with a translation warning", () => {
  const project = makeProject({
    name: "Kitty",
    terminal: "kitty",
    source:
      "font_size 12\nfuture_thing yes\ninclude other.conf\nnot a setting\n",
  });
  render(<UnmappedSettings project={project} />);
  expect(screen.getByRole("heading", { name: /^Unknown/ })).toBeVisible();
  expect(screen.getByRole("heading", { name: /^Include/ })).toBeVisible();
  const unknown = screen
    .getByRole("heading", { name: /^Unknown/ })
    .closest("section")!;
  expect(within(unknown).getByText("future_thing yes")).toBeVisible();
});

test("unmapped settings reports an empty draft", () => {
  render(
    <UnmappedSettings
      project={makeProject({ name: "E", terminal: "ghostty", source: "" })}
    />,
  );
  expect(screen.getByText("No unmapped lines in this draft.")).toBeVisible();
});
