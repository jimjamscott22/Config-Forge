import { expect, test } from "@playwright/test";

test("built-in templates start a draft with their colors on any terminal", async ({
  page,
}) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Retro Green/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Modern Dark/ }).click();
  await page.getByLabel("Terminal", { exact: true }).selectOption("alacritty");
  await page.getByRole("button", { name: "Open draft" }).click();
  await page.getByRole("tab", { name: "Source", exact: true }).click();
  await expect(page.locator(".config-source")).toContainText("#171a21");
  await expect(page.locator(".config-source")).toContainText("#f2b866");
});
