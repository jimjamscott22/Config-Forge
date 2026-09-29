import { expect, test } from "@playwright/test";

let errors: string[];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("shows the workbench and opens a terminal draft", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Config Forge");
  await expect(
    page.getByRole("heading", { name: "Config Forge" }),
  ).toBeVisible();
  await expect(page.getByText("Terminal configuration studio")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create New Config", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import Existing Config", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `/tmp/config-forge-task13-home-${testInfo.project.name}.png`,
    fullPage: false,
  });
  await page.getByRole("button", { name: "Create a Kitty config" }).click();
  await expect(page.getByLabel("Terminal", { exact: true })).toHaveValue(
    "kitty",
  );
  await page.getByLabel("Project name").fill("My Kitty");
  await page.getByRole("button", { name: "Open draft" }).click();
  await expect(page.getByRole("heading", { name: "My Kitty" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save project" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Apply config" }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "Source", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Validation", exact: true }),
  ).toBeFocused();
  await expect(page.getByText("Internal checks passed.")).toBeVisible();
  await page.getByRole("button", { name: "Config Forge home" }).click();
  await page.getByRole("button", { name: "Resume draft" }).click();
  await expect(page.getByRole("heading", { name: "My Kitty" })).toBeVisible();
});

for (const config of [
  {
    terminal: "ghostty",
    source: "# preserved comment\nfont-size = 14\nfuture-setting = untouched\n",
    name: "config",
  },
  {
    terminal: "kitty",
    source: "# preserved comment\nfont_size 14\nfuture_setting untouched\n",
    name: "kitty.conf",
  },
  {
    terminal: "alacritty",
    source:
      '# preserved comment\n[font]\nsize = 14.0 # inline\n\n[[keyboard.bindings]]\nkey = "F1"\naction = "None"\n',
    name: "alacritty.toml",
  },
]) {
  test(`imports ${config.terminal} files without changing source`, async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Import Existing Config", exact: true })
      .click();
    await page.getByLabel("Project name").fill(`Daily ${config.terminal}`);
    await page
      .getByLabel("Terminal", { exact: true })
      .selectOption(config.terminal);
    await page.getByLabel("Configuration file").setInputFiles({
      name: config.name,
      mimeType: "text/plain",
      buffer: Buffer.from(config.source),
    });
    await expect(page.getByLabel("Configuration source")).toHaveValue(
      config.source,
    );
    await page.getByRole("button", { name: "Open draft" }).click();
    await expect(page.locator(".config-source")).toHaveText(config.source);
    await expect(
      page.getByRole("heading", { name: `Daily ${config.terminal}` }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (config.terminal === "ghostty")
      await page.screenshot({
        path: `/tmp/config-forge-task13-studio-${testInfo.project.name}.png`,
        fullPage: false,
      });
  });
}

test("320px studio stays usable with long source and all four tabs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Import Existing Config", exact: true })
    .click();
  await page
    .getByLabel("Project name")
    .fill("A-long-project-name-without-breaks-to-check-small-screens");
  await page
    .getByLabel("Configuration source")
    .fill(`# ${"preserved".repeat(30)}\nfont-size ???\n`);
  await page.getByRole("button", { name: "Open draft" }).click();
  await expect(page.getByRole("tab")).toHaveCount(4);
  for (const tab of ["Controls", "Preview", "Source", "Validation"]) {
    await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await expect(page.getByText(/line 2/)).toBeVisible();
  const actions = await page.locator(".studio-actions").evaluate((element) => ({
    position: getComputedStyle(element).position,
    bottom: getComputedStyle(element).bottom,
  }));
  expect(actions.position).toBe("sticky");
  expect(actions.bottom).toBe("8px");
  await page.screenshot({
    path: "/tmp/config-forge-task13-studio-320.png",
    fullPage: false,
  });
});

test("invalid imports show a recoverable error", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import Existing Config", exact: true })
    .click();
  await page.getByLabel("Terminal", { exact: true }).selectOption("alacritty");
  await page.getByLabel("Configuration source").fill("[broken");
  await page.getByRole("button", { name: "Open draft" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Import a config" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("heading", { name: "Config Forge" }),
  ).toBeVisible();
});
