import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { makeProject } from "../../services/project-service";
import { TerminalPreview } from "./TerminalPreview";

test("renders a static shell sample, ANSI colors, styles, selection and configured cursor", () => {
  const shared = makeProject({ name: "Preview", terminal: "ghostty" }).shared;
  shared.cursor = { shape: "underline", blink: true };
  const { rerender } = render(<TerminalPreview shared={shared} />);
  expect(screen.getByLabelText("Mock terminal")).toBeVisible();
  expect(
    screen.getByText("Working tree clean.", { exact: false }),
  ).toBeVisible();
  expect(screen.getByLabelText("ANSI color palette").children).toHaveLength(16);
  expect(screen.getByLabelText("underline cursor")).toHaveClass("cursor-blink");
  expect(screen.getByText("Selected text looks like this.")).toBeVisible();
  expect(screen.getByText("Mock · no commands run")).toBeVisible();
  shared.cursor.blink = false;
  shared.window.decorations = "none";
  shared.behavior.scrollbackLines = 0;
  rerender(<TerminalPreview shared={shared} />);
  expect(screen.getByLabelText("underline cursor")).not.toHaveClass(
    "cursor-blink",
  );
  expect(screen.queryByText(/Last login/)).not.toBeInTheDocument();
  expect(screen.queryByText("forge — ~/projects")).not.toBeInTheDocument();
});
