import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { getAdapter } from "../../adapters/registry";
import { makeProject } from "../../services/project-service";
import { fieldSupport, fontFields } from "./control-fields";
import { FieldControl } from "./FieldControl";
import { VisualControls } from "./VisualControls";

const sizeField = fontFields.find((field) => field.path === "font.size");
if (!sizeField) throw new Error("Missing font size control");

test("invalid input stays visible without changing source; valid changes and reset preserve unrelated content", async () => {
  const initial = makeProject({
    terminal: "ghostty",
    name: "Draft",
    source: "# keep\nfont-size = 14\nfuture-option = yes\n",
  });
  const changed = vi.fn();
  function Editor() {
    const [project, setProject] = useState(initial);
    return (
      <>
        <FieldControl
          field={sizeField!}
          shared={project.shared}
          terminal="ghostty"
          onChange={(shared) => {
            changed(shared);
            setProject({ ...project, shared });
          }}
        />
        <pre data-testid="source">
          {getAdapter("ghostty").generate(project).source}
        </pre>
      </>
    );
  }
  render(<Editor />);
  const input = screen.getByLabelText("Font size (pt)");
  fireEvent.change(input, { target: { value: "100" } });
  expect(input).toHaveValue("100");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toBeVisible();
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByTestId("source")).toHaveTextContent("font-size = 14");
  fireEvent.change(input, { target: { value: "17.5" } });
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ font: expect.objectContaining({ size: 17.5 }) }),
  );
  expect(screen.getByTestId("source")).toHaveTextContent("font-size = 17.5");
  await userEvent.click(
    screen.getByRole("button", {
      name: "Reset Font size (pt) to terminal default",
    }),
  );
  expect(input).toHaveValue("");
  expect(screen.getByTestId("source").textContent).toBe(
    "# keep\nfuture-option = yes\n",
  );
  expect(initial.shared.font.size).toBe(14);
});

test("parent changes replace an invalid draft, and unsupported fields cannot be edited", () => {
  const project = makeProject({
    name: "Draft",
    terminal: "ghostty",
    source: "font-size = 14\n",
  });
  const onChange = vi.fn();
  const { rerender } = render(
    <FieldControl
      field={sizeField}
      shared={project.shared}
      terminal="ghostty"
      onChange={onChange}
    />,
  );
  fireEvent.change(screen.getByLabelText("Font size (pt)"), {
    target: { value: "bad" },
  });
  const shared = structuredClone(project.shared);
  shared.font.size = 20;
  rerender(
    <FieldControl
      field={sizeField}
      shared={shared}
      terminal="ghostty"
      onChange={onChange}
    />,
  );
  expect(screen.getByLabelText("Font size (pt)")).toHaveValue("20");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  rerender(<VisualControls project={project} onChange={onChange} />);
  expect(screen.getByLabelText("Bold font family")).toBeDisabled();
  expect(screen.getByLabelText("Font family")).toBeEnabled();
});

test("mapping and portability help comes from the adapters, including combined padding", () => {
  expect(fieldSupport("ghostty", "font.size")).toEqual({
    supported: true,
    native: "font-size",
    portableTo: ["kitty", "alacritty"],
  });
  expect(fieldSupport("alacritty", "window.paddingY")).toMatchObject({
    supported: true,
    native: "window.padding",
    portableTo: ["ghostty"],
  });
  expect(fieldSupport("kitty", "window.paddingY").supported).toBe(false);
});

test("only the assigned leaf is updated, and single-line font values are enforced", () => {
  const shared = makeProject({ name: "Draft", terminal: "ghostty" }).shared;
  const field = fontFields.find((item) => item.path === "font.family");
  if (!field) throw new Error("Missing font field");
  expect(field.update(shared, "Iosevka\nfont-size = 70").success).toBe(false);
  const result = field.update(shared, "Iosevka");
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.message);
  expect(result.shared).toEqual({
    ...shared,
    font: { ...shared.font, family: "Iosevka" },
  });
});

test("preserved native values cannot be silently overwritten by visual controls", () => {
  const project = makeProject({
    name: "Preserve",
    terminal: "alacritty",
    source: "[font]\nsize = 120 # keep unsupported size\n",
  });
  const onChange = vi.fn();
  render(<VisualControls project={project} onChange={onChange} />);
  expect(screen.getByLabelText("Font size (pt)")).toBeDisabled();
  expect(screen.getByText(/A preserved source value/)).toBeInTheDocument();
  expect(getAdapter("alacritty").generate(project).source).toBe(
    "[font]\nsize = 120 # keep unsupported size\n",
  );
  expect(onChange).not.toHaveBeenCalled();
});
