import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { makeProject } from "../../services/project-service";
import { AdvancedSource } from "./AdvancedSource";

const project = () =>
  makeProject({
    name: "Ghostty",
    terminal: "ghostty",
    source: "font-size = 13\n# keep me\n",
  });

async function startEditing(text: string, props = {}) {
  const onApply = vi.fn();
  render(<AdvancedSource project={project()} onApply={onApply} {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Edit source" }));
  const editor = screen.getByLabelText(/Native ghostty config/);
  fireEvent.change(editor, { target: { value: text } });
  return { onApply, editor };
}

test("shows read-only generated source until editing starts", () => {
  render(<AdvancedSource project={project()} onApply={() => {}} />);
  expect(screen.getByText("Read only")).toBeVisible();
  expect(screen.getByText(/# keep me/)).toBeVisible();
});

test("debounces parsing, then applies a recognized edit", async () => {
  const { onApply } = await startEditing("font-size = 14\n# keep me\n");
  expect(screen.getByText(/Unsaved edits · checking/)).toBeVisible();
  const apply = screen.getByRole("button", { name: "Apply source edit" });
  expect(apply).toBeDisabled();

  expect(await screen.findByText("Unsaved edits · parsed")).toBeVisible();
  expect(screen.getByRole("list", { name: "Changed lines" })).toBeVisible();
  await userEvent.click(apply);

  expect(onApply).toHaveBeenCalledOnce();
  expect(onApply.mock.calls[0]?.[0].shared.font.size).toBe(14);
  expect(screen.getByText("Read only")).toBeVisible();
});

test("unmapped additions need a diff review before applying", async () => {
  const { onApply } = await startEditing(
    "font-size = 13\n# keep me\nexperimental-option = yes\n",
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(/cannot map/);
  const apply = screen.getByRole("button", { name: "Apply source edit" });
  expect(apply).toBeDisabled();

  await userEvent.click(screen.getByRole("checkbox", { name: /reviewed/ }));
  expect(apply).toBeEnabled();
  await userEvent.click(apply);
  expect(onApply).toHaveBeenCalledOnce();
});

test("keeps the text and shows line diagnostics when the edit cannot parse", async () => {
  const alacritty = makeProject({
    name: "Alacritty",
    terminal: "alacritty",
    source: "[font]\nsize = 12\n",
  });
  const onApply = vi.fn();
  render(<AdvancedSource project={alacritty} onApply={onApply} />);
  await userEvent.click(screen.getByRole("button", { name: "Edit source" }));
  const editor = screen.getByLabelText(/Native alacritty config/);
  fireEvent.change(editor, { target: { value: "[font\nsize = \n" } });

  expect(await screen.findByText("Unsaved edits · cannot apply")).toBeVisible();
  expect(editor).toHaveValue("[font\nsize = \n");
  expect(screen.getByText(/^error/)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Apply source edit" }),
  ).toBeDisabled();
});

test("Revert to Generated Source discards the edit", async () => {
  const { onApply } = await startEditing("font-size = 99\n");
  await userEvent.click(
    screen.getByRole("button", { name: "Revert to Generated Source" }),
  );
  expect(screen.getByText("Read only")).toBeVisible();
  expect(onApply).not.toHaveBeenCalled();
});

test("a review ticked for one project state does not carry over to the next", async () => {
  const first = project();
  const onApply = vi.fn();
  const { rerender } = render(
    <AdvancedSource project={first} onApply={onApply} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Edit source" }));
  fireEvent.change(screen.getByLabelText(/Native ghostty config/), {
    target: { value: "font-size = 13\n# keep me\nexperimental-option = yes\n" },
  });
  await userEvent.click(
    await screen.findByRole("checkbox", { name: /reviewed/ }),
  );
  expect(
    screen.getByRole("button", { name: "Apply source edit" }),
  ).toBeEnabled();

  const changed = structuredClone(first);
  changed.shared.font.size = 20;
  rerender(<AdvancedSource project={changed} onApply={onApply} />);

  expect(await screen.findByText(/Visual controls changed/)).toBeVisible();
  expect(
    await screen.findByRole("checkbox", { name: /reviewed/ }),
  ).not.toBeChecked();
  expect(
    screen.getByRole("button", { name: "Apply source edit" }),
  ).toBeDisabled();
});
