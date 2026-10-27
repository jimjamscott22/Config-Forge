import { expect, test } from "@playwright/test";
import { installTauriMock, readMockState } from "./support/tauri-mock";

const source =
  "# my ghostty comment\nfont-size = 15\nbackground = #101820\nfuture-setting = keep\n";

test("translates a saved Ghostty project into a new Kitty project with a report", async ({
  page,
}) => {
  await installTauriMock(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import Existing Config", exact: true })
    .click();
  await page.getByLabel("Project name").fill("Ghostty daily");
  await page.getByLabel("Terminal", { exact: true }).selectOption("ghostty");
  await page.getByLabel("Configuration source").fill(source);
  await page.getByRole("button", { name: "Open draft" }).click();
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.locator(".draft-badge")).toHaveText("Saved");
  const [sourceProject] = Object.values((await readMockState(page)).projects);
  if (!sourceProject) throw new Error("the source project was not saved");

  await page.getByLabel("Translate to", { exact: true }).selectOption("kitty");
  await page.getByRole("button", { name: "Translate to new project" }).click();

  const report = page.getByRole("region", { name: "Translation report" });
  await expect(report).toBeVisible();
  await expect(report).toContainText("ghostty → kitty");

  const state = await readMockState(page);
  const projects = Object.values(state.projects);
  expect(projects).toHaveLength(2);
  const translated = projects.find((project) => project.terminal === "kitty");
  expect(translated).toBeDefined();
  expect(translated?.id).not.toBe(sourceProject.id);
  expect(state.projects[sourceProject.id as string]).toEqual(sourceProject);
  expect((translated?.shared as { font: { size: number } }).font.size).toBe(15);
  expect(JSON.stringify(translated?.shared)).toContain("#101820");
  // The source project got an automatic snapshot before translation.
  expect(
    Object.values(state.snapshots).some(
      (snapshot) => snapshot.reason === "before-translation",
    ),
  ).toBe(true);

  await page.getByRole("button", { name: /^Open “Ghostty daily/ }).click();
  await expect(page.getByText("kitty / workspace")).toBeVisible();
  await expect(page.locator(".config-source")).toContainText("font_size 15");
  await expect(page.locator(".config-source")).not.toContainText(
    "future-setting",
  );

  // The original is untouched and still has its comments and unknown setting.
  await page.getByRole("button", { name: "Config Forge home" }).click();
  await page.getByRole("button", { name: /^Ghostty daily\s*ghostty/ }).click();
  await expect(page.locator(".config-source")).toContainText(
    "# my ghostty comment",
  );
  await expect(page.locator(".config-source")).toContainText(
    "future-setting = keep",
  );
});
