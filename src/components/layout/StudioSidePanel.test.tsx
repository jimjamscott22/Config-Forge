import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import {
  StudioSidePanel,
  type SidePanelSection,
  type SidePanelTab,
} from "./StudioSidePanel";

const sections: SidePanelSection[] = [
  {
    id: "source",
    label: "Source",
    content: <input aria-label="Source text" />,
  },
  { id: "validation", label: "Validation", content: <p>All clear</p> },
  { id: "write", label: "Write", content: <input aria-label="Destination" /> },
];

function Harness({ onClose = () => undefined }: { onClose?(): void }) {
  const [active, setActive] = useState<SidePanelTab>("source");
  return (
    <StudioSidePanel
      open
      active={active}
      sections={sections}
      note="Projects are stored locally on this computer."
      onSelect={setActive}
      onClose={onClose}
    />
  );
}

test("renders nothing when closed", () => {
  const { container } = render(
    <StudioSidePanel
      open={false}
      active="source"
      sections={sections}
      onSelect={() => undefined}
      onClose={() => undefined}
    />,
  );
  expect(container).toBeEmptyDOMElement();
});

test("shows the active section, focuses it, and keeps inactive sections mounted", async () => {
  render(<Harness />);
  expect(screen.getByLabelText("Source text")).toHaveFocus();
  expect(screen.getByText("All clear")).not.toBeVisible();
  await userEvent.type(screen.getByLabelText("Source text"), "draft");
  await userEvent.click(screen.getByRole("tab", { name: "Validation" }));
  expect(screen.getByText("All clear")).toBeVisible();
  await userEvent.click(screen.getByRole("tab", { name: "Source" }));
  expect(screen.getByLabelText("Source text")).toHaveValue("draft");
});

test("arrow, Home and End keys move between tabs", async () => {
  render(<Harness />);
  screen.getByRole("tab", { name: "Source" }).focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "Validation" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await userEvent.keyboard("{End}");
  expect(screen.getByRole("tab", { name: "Write" })).toHaveFocus();
  await userEvent.keyboard("{Home}");
  expect(screen.getByRole("tab", { name: "Source" })).toHaveFocus();
  await userEvent.keyboard("{ArrowLeft}");
  expect(screen.getByRole("tab", { name: "Write" })).toHaveFocus();
});

test("Escape and the close button call onClose", async () => {
  const onClose = vi.fn();
  render(<Harness onClose={onClose} />);
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledTimes(2);
});
