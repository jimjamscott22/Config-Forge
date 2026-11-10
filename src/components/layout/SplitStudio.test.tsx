import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { getAdapter } from "../../adapters/registry";
import { makeProject } from "../../services/project-service";
import * as validationService from "../../services/validation-service";
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
    screen.getByRole("heading", { name: "Visual settings" }),
  ).toBeVisible();
  await userEvent.keyboard("{End}");
  expect(screen.getByRole("tab", { name: /Validation/ })).toHaveFocus();
  expect(screen.getByText(/line 1/)).toBeVisible();
  expect(screen.getByRole("tabpanel", { name: /Validation/ })).toBeVisible();
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

test("memoizes generation and validation across tab switches and re-renders for the same project revision", async () => {
  const draft = project();
  const adapter = getAdapter(draft.terminal);
  const generateSpy = vi.spyOn(adapter, "generate");
  const validateSpy = vi.spyOn(validationService, "validateProject");

  const { rerender } = render(
    <SplitStudio project={draft} onOpen={() => {}} onHome={() => {}} />,
  );
  expect(generateSpy).toHaveBeenCalledTimes(1);
  expect(validateSpy).toHaveBeenCalledTimes(1);

  await userEvent.click(screen.getByRole("tab", { name: "Preview" }));
  await userEvent.click(screen.getByRole("tab", { name: "Validation" }));
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
