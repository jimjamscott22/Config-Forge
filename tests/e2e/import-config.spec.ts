import { expect, test } from "@playwright/test";
import { installTauriMock } from "./support/tauri-mock";

const configs = [
  {
    terminal: "ghostty",
    source: "# keep this comment\nfont-size = 14\nfuture-setting = untouched\n",
    unknown: "future-setting = untouched",
  },
  {
    terminal: "kitty",
    source:
      "# keep this comment\nfont_size 14\ninclude other.conf\nfuture_setting untouched\n",
    unknown: "include other.conf",
  },
  {
    terminal: "alacritty",
    source:
      '# keep this comment\n[font]\nsize = 14.0 # inline\n\n[[keyboard.bindings]]\nkey = "F1"\naction = "None"\n',
    unknown: "[[keyboard.bindings]]",
  },
] as const;

for (const config of configs) {
  test(`imports ${config.terminal}, edits a setting, and keeps comments and unknown content after save and reopen`, async ({
    page,
  }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Import Existing Config", exact: true })
      .click();
    await page.getByLabel("Project name").fill(`Imported ${config.terminal}`);
    await page
      .getByLabel("Terminal", { exact: true })
      .selectOption(config.terminal);
    await page.getByLabel("Configuration source").fill(config.source);
    await page.getByRole("button", { name: "Open draft" }).click();

    // Change one recognised setting through the source editor.
    const edited = config.source
      .replace("14.0", "16.0")
      .replace(/\b14\b/, "16");
    await page.getByRole("tab", { name: "Source", exact: true }).click();
    await page.getByRole("button", { name: "Edit source" }).click();
    await page.getByLabel(`Native ${config.terminal} config`).fill(edited);
    await expect(page.getByText("Unsaved edits · parsed")).toBeVisible();
    const review = page.getByRole("checkbox", { name: /reviewed this diff/ });
    if (await review.count()) await review.check();
    await page.getByRole("button", { name: "Apply source edit" }).click();

    await expect(page.locator(".config-source")).toContainText(
      "# keep this comment",
    );
    await expect(page.locator(".config-source")).toContainText(config.unknown);
    await expect(page.locator(".config-source")).toContainText("16");

    await page.getByRole("button", { name: "Save project" }).click();
    await expect(page.locator(".draft-badge")).toHaveText("Saved");
    await page.reload();
    await page
      .getByRole("button", { name: new RegExp(`Imported ${config.terminal}`) })
      .click();
    await expect(page.locator(".config-source")).toContainText(
      "# keep this comment",
    );
    await expect(page.locator(".config-source")).toContainText(config.unknown);
    await expect(page.locator(".config-source")).toContainText("16");
  });
}
