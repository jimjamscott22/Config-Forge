import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ProjectDraftForm } from "./ProjectDraftForm";

test("file import reads source without inventing a live configuration path", async () => {
  const onOpen = vi.fn(() => true);
  render(
    <ProjectDraftForm mode="import" onOpen={onOpen} onCancel={() => {}} />,
  );
  const file = new File(["# original\nfont-size = 15\n"], "config", {
    type: "text/plain",
  });
  Object.defineProperty(file, "text", {
    value: async () => "# original\nfont-size = 15\n",
  });
  await userEvent.upload(screen.getByLabelText("Configuration file"), file);
  await waitFor(() =>
    expect(screen.getByLabelText("Configuration source")).toHaveValue(
      "# original\nfont-size = 15\n",
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Open draft" }));
  expect(onOpen).toHaveBeenCalledWith(
    expect.objectContaining({
      sourcePath: null,
      shared: expect.objectContaining({
        font: expect.objectContaining({ size: 15 }),
      }),
    }),
  );
});

test("empty import and whitespace-only names surface errors", async () => {
  const onOpen = vi.fn(() => true);
  render(
    <ProjectDraftForm mode="import" onOpen={onOpen} onCancel={() => {}} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Open draft" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Choose a file or paste");
  fireEvent.change(screen.getByLabelText("Configuration source"), {
    target: { value: "font-size = 15" },
  });
  fireEvent.change(screen.getByLabelText("Project name"), {
    target: { value: "   " },
  });
  await userEvent.click(screen.getByRole("button", { name: "Open draft" }));
  expect(screen.getByRole("alert")).toBeVisible();
  expect(onOpen).not.toHaveBeenCalled();
});
