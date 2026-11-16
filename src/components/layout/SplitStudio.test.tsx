import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { getAdapter } from "../../adapters/registry";
import { makeProject } from "../../services/project-service";
import * as validationService from "../../services/validation-service";
import { fontFields } from "../editor/control-fields";
import { SplitStudio } from "./SplitStudio";

const project = () =>
  makeProject({
    name: "Daily config",
    terminal: "ghostty",
    source: "# preserve me\nfont-size = 13\nfuture-setting = keep\n",
  });
const sizeField = fontFields.find((field) => field.path === "font.size")!;

test("plain browser studio shows preview and controls, hides workflow tabs, and disables writes", async () => {
  render(
    <SplitStudio project={project()} onOpen={() => {}} onHome={() => {}} />,
  );
  expect(
    screen.getByRole("heading", { name: "Daily config" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Visual controls")).toBeVisible();
  expect(screen.getByLabelText("Live preview")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Session draft");
  expect(screen.getByRole("button", { name: "Save project" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Write to disk" })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Source" }));
  expect(screen.getByText(/# preserve me/)).toBeVisible();
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "Source",
    "Validation",
  ]);
  expect(
    screen.getByText(
      "Session draft · Saving and applying need the desktop app.",
      { selector: ".side-panel-note" },
    ),
  ).toBeVisible();
});

test("source button opens the source tab and closing returns focus", async () => {
  render(
    <SplitStudio project={project()} onOpen={() => {}} onHome={() => {}} />,
  );
  const opener = screen.getByRole("button", { name: "Source" });
  await userEvent.click(opener);
  expect(screen.getByRole("tab", { name: "Source" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(opener).toHaveFocus();
});

test("validation button reports warnings and opens the validation tab", async () => {
  const draft = makeProject({
    name: "Malformed",
    terminal: "ghostty",
    source: "font-size ???\n",
  });
  render(<SplitStudio project={draft} onOpen={() => {}} onHome={() => {}} />);
  const button = screen.getByRole("button", { name: /^Validation: / });
  await userEvent.click(button);
  expect(screen.getByRole("tab", { name: /Validation/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText(/line 1/)).toBeVisible();
});

test("status shows the number of fields changed since the baseline", () => {
  const saved = project();
  const edited = sizeField.update(saved.shared, "16");
  if (!edited.success) throw new Error(edited.message);
  render(
    <SplitStudio
      project={{ ...saved, shared: edited.shared }}
      baseline={saved}
      onOpen={() => {}}
      onHome={() => {}}
      persistence={{ persisted: true, dirty: true, onSave: () => {} }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("1 changed");
  expect(screen.getByText("was 13")).toBeVisible();
});

test("status shows unsaved changes for a source-only edit", () => {
  const saved = project();
  render(
    <SplitStudio
      project={{ ...saved, name: "Renamed in source" }}
      baseline={saved}
      onOpen={() => {}}
      onHome={() => {}}
      persistence={{ persisted: true, dirty: true, onSave: () => {} }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
});

test("write to disk opens the write tab when workflow panels exist", async () => {
  render(
    <SplitStudio
      project={project()}
      onOpen={() => {}}
      onHome={() => {}}
      persistence={{ persisted: true, dirty: false, onSave: () => {} }}
      actions={{
        write: <input aria-label="Destination path" />,
        export: <p>Export panel</p>,
      }}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Write to disk" }));
  expect(screen.getByRole("tab", { name: "Write" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByLabelText("Destination path")).toHaveFocus();
  expect(screen.getByRole("tab", { name: "Export" })).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "History" })).toBeNull();
});

test("switching projects discards the previous project's source draft", async () => {
  const a = project();
  const b = makeProject({
    name: "Other",
    terminal: "kitty",
    source: "font_size 11\n",
  });
  const { rerender } = render(
    <SplitStudio
      project={a}
      onOpen={() => {}}
      onHome={() => {}}
      onProjectChange={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Source" }));
  await userEvent.click(screen.getByRole("button", { name: "Edit source" }));
  expect(screen.getByLabelText(/Native ghostty config/)).toBeVisible();

  rerender(
    <SplitStudio
      project={b}
      onOpen={() => {}}
      onHome={() => {}}
      onProjectChange={() => {}}
    />,
  );

  expect(screen.queryByLabelText(/Native ghostty config/)).toBeNull();
  expect(screen.getByRole("button", { name: "Edit source" })).toBeVisible();
});

test("memoizes generation and validation across panel switches and re-renders for the same project revision", async () => {
  const draft = project();
  const adapter = getAdapter(draft.terminal);
  const generateSpy = vi.spyOn(adapter, "generate");
  const validateSpy = vi.spyOn(validationService, "validateProject");

  const { rerender } = render(
    <SplitStudio project={draft} onOpen={() => {}} onHome={() => {}} />,
  );
  expect(generateSpy).toHaveBeenCalledTimes(1);
  expect(validateSpy).toHaveBeenCalledTimes(1);

  await userEvent.click(screen.getByRole("button", { name: "Source" }));
  await userEvent.click(screen.getByRole("tab", { name: /Validation/ }));
  rerender(
    <SplitStudio
      project={draft}
      busy={true}
      onOpen={() => {}}
      onHome={() => {}}
    />,
  );
  expect(generateSpy).toHaveBeenCalledTimes(1);
  expect(validateSpy).toHaveBeenCalledTimes(1);

  const nextRevision = {
    ...draft,
    shared: {
      ...draft.shared,
      font: { ...draft.shared.font, size: 16 },
    },
    updatedAt: new Date().toISOString(),
  };
  rerender(
    <SplitStudio project={nextRevision} onOpen={() => {}} onHome={() => {}} />,
  );
  expect(generateSpy).toHaveBeenCalledTimes(2);
  expect(validateSpy).toHaveBeenCalledTimes(2);

  generateSpy.mockRestore();
  validateSpy.mockRestore();
});
