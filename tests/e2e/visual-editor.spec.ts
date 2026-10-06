import { expect, test, type Page } from "@playwright/test";

async function showControls(page: Page) {
  const tab = page.getByRole("tab", { name: "Controls", exact: true });
  if (await tab.count()) await tab.click();
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
});

for (const fixture of [
  {
    terminal: "ghostty",
    source: "# preserved\nfont-size = 14\nfuture-option = yes\n",
    size: "font-size = 18.5",
    keep: "future-option = yes",
  },
  {
    terminal: "kitty",
    source:
      "# preserved\nfont_size 14\ninclude extras.conf\nfuture_option yes\n",
    size: "font_size 18.5",
    keep: "include extras.conf",
  },
  {
    terminal: "alacritty",
    source:
      "# preserved\n[font]\nsize = 14.0 # font note\n[custom]\nkeep = true\n",
    size: "size = 18.5",
    keep: "keep = true",
  },
]) {
  test(`edits ${fixture.terminal} controls without losing preserved source`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/");
    await expect(page).toHaveTitle("Config Forge");
    await page
      .getByRole("button", { name: "Import Existing Config", exact: true })
      .click();
    await page
      .getByLabel("Terminal", { exact: true })
      .selectOption(fixture.terminal);
    await page.getByLabel("Project name").fill(`Visual ${fixture.terminal}`);
    await page.getByLabel("Configuration source").fill(fixture.source);
    await page.getByRole("button", { name: "Open draft" }).click();
    await showControls(page);
    const size = page.getByLabel("Font size (pt)", { exact: true });
    await size.fill("100");
    await expect(size).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("tab", { name: "Source", exact: true }).click();
    await expect(page.locator(".config-source")).toHaveText(fixture.source);
    await showControls(page);
    await size.fill("18.5");
    await expect(size).toHaveAttribute("aria-invalid", "false");
    await page.getByRole("tab", { name: "Source", exact: true }).click();
    await expect(page.locator(".config-source")).toContainText(fixture.size);
    await expect(page.locator(".config-source")).toContainText(fixture.keep);
    await expect(page.locator(".config-source")).toContainText("# preserved");
    await showControls(page);
    await page.getByText("Window & cursor", { exact: true }).click();
    await page.getByLabel("Opacity (0.1–1)", { exact: true }).fill("0.92");
    await page
      .getByLabel("Horizontal padding (px)", { exact: true })
      .fill("10");
    if (fixture.terminal === "kitty")
      await expect(
        page.getByLabel("Vertical padding (px)", { exact: true }),
      ).toBeDisabled();
    else
      await page
        .getByLabel("Vertical padding (px)", { exact: true })
        .fill("12");
    await page.getByLabel("Cursor shape", { exact: true }).selectOption("beam");
    await page
      .getByLabel("Blinking cursor", { exact: true })
      .selectOption("true");
    await page.getByText("Colors", { exact: true }).click();
    await page.getByLabel("Background", { exact: true }).fill("#303446");
    await page.getByRole("tab", { name: "Preview", exact: true }).click();
    const preview = page.getByLabel("Mock terminal", { exact: true });
    await expect(preview).toBeVisible();
    await expect(preview).toHaveCSS("opacity", "0.92");
    await expect(preview).toHaveCSS("background-color", "rgb(48, 52, 70)");
    await expect(preview).toHaveCSS("padding-left", "10px");
    await expect(preview).toHaveCSS(
      "padding-top",
      fixture.terminal === "kitty" ? "10px" : "12px",
    );
    await expect(page.getByLabel("beam cursor", { exact: true })).toHaveClass(
      /cursor-blink/,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByLabel("beam cursor", { exact: true })).toHaveCSS(
      "animation-name",
      "none",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.getByLabel("beam cursor", { exact: true })).toHaveCSS(
      "animation-name",
      "preview-blink",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (fixture.terminal === "ghostty")
      await page.screenshot({
        path: `/tmp/config-forge-task14-preview-${testInfo.project.name}.png`,
        fullPage: false,
      });
    await showControls(page);
    await page
      .getByRole("button", { name: "Reset Font size (pt) to terminal default" })
      .click();
    await expect(size).toHaveValue("");
    await page.getByRole("tab", { name: "Source", exact: true }).click();
    await expect(page.locator(".config-source")).not.toContainText(
      fixture.size,
    );
    await expect(page.locator(".config-source")).toContainText(fixture.keep);
    if (fixture.terminal === "alacritty")
      await expect(page.locator(".config-source")).toContainText("# font note");
    expect(errors).toEqual([]);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  });
}

test("320px controls validate and the preview stays contained at extreme settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create New Config", exact: true })
    .click();
  await page.getByRole("button", { name: "Open draft" }).click();
  await showControls(page);
  await page
    .getByLabel("Font family", { exact: true })
    .fill("A long font family name that should not widen the controls");
  await page.getByLabel("Font size (pt)", { exact: true }).fill("96");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByText("Window & cursor", { exact: true }).click();
  await page.getByLabel("Horizontal padding (px)", { exact: true }).fill("200");
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.getByLabel("Mock terminal", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/config-forge-task14-preview-extreme-320.png",
    fullPage: false,
  });
});
