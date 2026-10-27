import { expect, test } from "@playwright/test";
import { installTauriMock, readMockState } from "./support/tauri-mock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
});

test("creates a Ghostty project from a built-in template, saves it, and reopens it after a restart", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Modern Dark/ }).click();
  await page.getByLabel("Terminal", { exact: true }).selectOption("ghostty");
  await page.getByLabel("Project name").fill("Daily Ghostty");
  await page.getByRole("button", { name: "Open draft" }).click();

  await expect(
    page.getByRole("heading", { name: "Daily Ghostty" }),
  ).toBeVisible();
  await expect(page.getByText("ghostty / workspace")).toBeVisible();
  await expect(page.locator(".draft-badge")).toHaveText("Not saved yet");
  expect(Object.keys((await readMockState(page)).projects)).toHaveLength(0);

  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.locator(".draft-badge")).toHaveText("Saved");
  expect(Object.keys((await readMockState(page)).projects)).toHaveLength(1);

  await page.reload();
  await expect(
    page.getByRole("button", { name: /Daily Ghostty/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Daily Ghostty/ }).click();
  await expect(
    page.getByRole("heading", { name: "Daily Ghostty" }),
  ).toBeVisible();
  await expect(page.locator(".draft-badge")).toHaveText("Saved");
  await expect(page.locator(".config-source")).toContainText("#171a21");
});

test("edits made after saving are marked unsaved until saved again", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create New Config", exact: true })
    .click();
  await page.getByRole("button", { name: "Open draft" }).click();
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.locator(".draft-badge")).toHaveText("Saved");
  await expect(
    page.getByRole("button", { name: "Save project" }),
  ).toBeDisabled();
});
