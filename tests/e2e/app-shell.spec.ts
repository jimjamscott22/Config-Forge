import { expect, test } from "@playwright/test";

test("shows the Config Forge application shell", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Config Forge" }),
  ).toBeVisible();
  await expect(page.getByText("Terminal configuration studio")).toBeVisible();
});
