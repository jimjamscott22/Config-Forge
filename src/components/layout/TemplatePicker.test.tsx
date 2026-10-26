import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { createTemplateService } from "../../services/template-service";
import { makeTemplateClient } from "../../test/fixtures/template-client";
import { builtinTemplates } from "../../templates/builtins";
import { TemplatePicker } from "./TemplatePicker";

afterEach(() => vi.unstubAllGlobals());

// jsdom lacks Blob.text(); real browsers and the Tauri webview have it.
function readable(file: File) {
  file.text = () =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  return file;
}

test("lists built-ins read-only when no service is connected", async () => {
  const onUse = vi.fn();
  render(<TemplatePicker templates={[...builtinTemplates]} onUse={onUse} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(builtinTemplates.length);
  expect(screen.queryByRole("button", { name: /Duplicate/ })).toBeNull();
  expect(
    screen.getByText(/Personal templates are saved by the desktop app/),
  ).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /^Modern Dark/ }));
  expect(onUse).toHaveBeenCalledWith(
    expect.objectContaining({ id: "builtin-modern-dark" }),
  );
});

test("filters by terminal, keeping portable templates", async () => {
  const { client } = makeTemplateClient();
  const service = createTemplateService(client);
  const kitty = await service.duplicate("builtin-minimal", "Kitty only");
  await service.update(kitty.id, {});
  // Make a terminal-specific personal template.
  await client.updateTemplate({ ...kitty, terminal: "kitty" });
  render(<TemplatePicker templates={[]} service={service} />);
  await screen.findByRole("button", { name: /^Kitty only/ });
  await userEvent.selectOptions(screen.getByLabelText("Terminal"), "ghostty");
  expect(screen.queryByRole("button", { name: /^Kitty only/ })).toBeNull();
  expect(screen.getByRole("button", { name: /^Modern Dark/ })).toBeVisible();
});

test("duplicates a built-in, renames it, and deletes it after confirmation", async () => {
  const { client, templates } = makeTemplateClient();
  const service = createTemplateService(client);
  render(<TemplatePicker templates={[]} service={service} />);
  await screen.findByRole("button", { name: /^Modern Dark/ });
  expect(
    screen.queryByRole("button", { name: "Rename Modern Dark" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Delete Modern Dark" }),
  ).toBeNull();

  await userEvent.click(
    screen.getByRole("button", { name: "Duplicate Modern Dark" }),
  );
  await screen.findByRole("button", { name: /^Modern Dark copy/ });
  expect(templates.size).toBe(1);

  await userEvent.click(
    screen.getByRole("button", { name: "Rename Modern Dark copy" }),
  );
  const input = screen.getByLabelText(/New name for Modern Dark copy/);
  await userEvent.clear(input);
  await userEvent.type(input, "Night shift");
  await userEvent.click(screen.getByRole("button", { name: "Save name" }));
  await screen.findByRole("button", { name: /^Night shift/ });

  const confirm = vi
    .spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Delete Night shift" }),
  );
  expect(templates.size).toBe(1);
  await userEvent.click(
    screen.getByRole("button", { name: "Delete Night shift" }),
  );
  await waitFor(() => expect(templates.size).toBe(0));
  expect(confirm).toHaveBeenCalledTimes(2);
});

test("imports a bundle file and reports invalid bundles", async () => {
  const { client, templates } = makeTemplateClient();
  const service = createTemplateService(client);
  const bundle = await service.exportBundle(["builtin-retro-green"]);
  render(<TemplatePicker templates={[]} service={service} />);
  await screen.findByRole("button", { name: /^Retro Green/ });
  const input = screen.getByLabelText(/Import bundle/);

  await userEvent.upload(
    input,
    readable(new File(["nope"], "bad.json", { type: "application/json" })),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /Not a valid template bundle/,
  );
  expect(templates.size).toBe(0);

  await userEvent.upload(
    input,
    readable(new File([bundle], "ok.json", { type: "application/json" })),
  );
  await waitFor(() => expect(templates.size).toBe(1));
  const personal = (
    await screen.findAllByRole("button", { name: /^Retro Green/ })
  ).length;
  expect(personal).toBe(2);
});
