import { expect, test } from "@playwright/test";

test("source edits round-trip into the controls and keep preserved lines", async ({
  page,
}) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import Existing Config", exact: true })
    .click();
  await page.getByLabel("Terminal", { exact: true }).selectOption("ghostty");
  await page.getByLabel("Project name").fill("Source edit");
  await page
    .getByLabel("Configuration source")
    .fill("# preserved\nfont-size = 14\nfuture-option = yes\n");
  await page.getByRole("button", { name: "Open draft" }).click();
  await page.getByRole("tab", { name: "Source", exact: true }).click();
  await page.getByRole("button", { name: "Edit source" }).click();
  await page
    .getByLabel("Native ghostty config")
    .fill("# preserved\nfont-size = 16\nfuture-option = yes\nnew-option = 1\n");
  await expect(page.getByText("Unsaved edits · parsed")).toBeVisible();
  const apply = page.getByRole("button", { name: "Apply source edit" });
  await expect(apply).toBeDisabled();
  await page.getByRole("checkbox", { name: /reviewed this diff/ }).check();
  await apply.click();
  await expect(page.locator(".config-source")).toContainText("font-size = 16");
  await expect(page.locator(".config-source")).toContainText("new-option = 1");
  await expect(page.locator(".config-source")).toContainText("# preserved");
  await page.getByRole("tab", { name: "Validation", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Validation" })).toBeVisible();
});
