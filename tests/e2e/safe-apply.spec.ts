import { expect, test, type Page } from "@playwright/test";
import {
  installTauriMock,
  patchMockState,
  readMockState,
} from "./support/tauri-mock";

const DESTINATION = "/home/me/.config/ghostty/config";
const LIVE = "# live config\nfont-size = 9\nfuture-setting = keep\n";

async function openSavedProject(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import Existing Config", exact: true })
    .click();
  await page.getByLabel("Project name").fill("Applied config");
  await page.getByLabel("Terminal", { exact: true }).selectOption("ghostty");
  await page.getByLabel("Configuration source").fill(LIVE.replace("9", "14"));
  await page.getByRole("button", { name: "Open draft" }).click();
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.locator(".draft-badge")).toHaveText("Saved");
}

async function reviewApply(page: Page, destination = DESTINATION) {
  await page.getByLabel("Destination path").fill(destination);
  await page.getByRole("button", { name: "Review changes" }).click();
}

test("apply needs an explicit reviewed confirmation, backs up, writes, and verifies", async ({
  page,
}) => {
  await installTauriMock(page, { files: { [DESTINATION]: LIVE } });
  await openSavedProject(page);

  await reviewApply(page);
  await expect(page.getByText("Live config → Candidate")).toBeVisible();
  await expect(page.getByText("/data/backups/ghostty/")).toBeVisible();
  const apply = page.getByRole("button", { name: "Apply to file" });
  await expect(apply).toBeDisabled();
  // Nothing has been written while the review is open.
  expect((await readMockState(page)).files[DESTINATION]).toBe(LIVE);

  await page.getByRole("checkbox", { name: /reviewed this diff/ }).check();
  await apply.click();
  await expect(page.getByText(/^Applied to \/home\/me/)).toBeVisible();

  const state = await readMockState(page);
  expect(state.files[DESTINATION]).toContain("font-size = 14");
  expect(state.files[DESTINATION]).toContain("future-setting = keep");
  expect(state.backups).toHaveLength(1);
  const [backup] = state.backups;
  expect(backup?.content).toBe(LIVE);
  expect(state.files[backup?.path ?? ""]).toBe(LIVE);
  expect(
    Object.values(state.snapshots).some(
      (snapshot) => snapshot.reason === "before-direct-apply",
    ),
  ).toBe(true);
  // Order: snapshot and backup happen before the write, and the file is read back.
  const calls = state.calls;
  const lastIndex = (name: string) => calls.lastIndexOf(name);
  expect(lastIndex("create_snapshot")).toBeLessThan(lastIndex("apply_config"));
  expect(lastIndex("create_config_backup")).toBeLessThan(
    lastIndex("apply_config"),
  );
  expect(lastIndex("apply_config")).toBeLessThan(lastIndex("read_text_file"));
  // The project remembers where it was applied and is saved.
  await expect(page.locator(".draft-badge")).toHaveText("Saved");
  expect(Object.values(state.projects)[0]?.destinationPath).toBe(DESTINATION);
});

test("a failing native validator blocks the apply before any review", async ({
  page,
}) => {
  await installTauriMock(page, {
    files: { [DESTINATION]: LIVE },
    validators: {
      ghostty: "Native validation failed with exit code 1: bad key",
    },
  });
  await openSavedProject(page);
  await reviewApply(page);
  await expect(page.getByRole("alert")).toContainText("bad key");
  await expect(
    page.getByText("Apply blocked by validation errors"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply to file" })).toHaveCount(
    0,
  );
  const state = await readMockState(page);
  expect(state.files[DESTINATION]).toBe(LIVE);
  expect(state.calls).not.toContain("apply_config");
  expect(state.calls).toContain("validate_candidate");
});

test("a passing native validator lets the review proceed", async ({ page }) => {
  await installTauriMock(page, {
    files: { [DESTINATION]: LIVE },
    validators: { ghostty: null },
  });
  await openSavedProject(page);
  await reviewApply(page);
  await expect(
    page.getByRole("button", { name: "Apply to file" }),
  ).toBeVisible();
  const state = await readMockState(page);
  expect(state.calls).toContain("stage_candidate");
  expect(state.calls).toContain("remove_staged_candidate");
});

test("cancelling the review leaves the live config alone", async ({ page }) => {
  await installTauriMock(page, { files: { [DESTINATION]: LIVE } });
  await openSavedProject(page);
  await reviewApply(page);
  await page.getByRole("button", { name: "Cancel apply" }).click();
  await expect(page.getByText(/Apply cancelled/)).toBeVisible();
  const state = await readMockState(page);
  expect(state.files[DESTINATION]).toBe(LIVE);
  expect(state.backups).toHaveLength(0);
  expect(state.calls).not.toContain("apply_config");
});

test("a failed write is reported and the original stays", async ({ page }) => {
  await installTauriMock(page, { files: { [DESTINATION]: LIVE } });
  await openSavedProject(page);
  await patchMockState(page, { failApplyWith: "disk full" });
  await reviewApply(page);
  await page.getByRole("checkbox", { name: /reviewed this diff/ }).check();
  await page.getByRole("button", { name: "Apply to file" }).click();
  await expect(page.getByRole("alert").last()).toContainText("disk full");
  await expect(page.getByText(/^Applied to/)).toHaveCount(0);
  expect((await readMockState(page)).files[DESTINATION]).toBe(LIVE);
});

test("a destination edited after review is rejected instead of overwritten", async ({
  page,
}) => {
  await installTauriMock(page, { files: { [DESTINATION]: LIVE } });
  await openSavedProject(page);
  await reviewApply(page);
  await patchMockState(page, {
    files: { [DESTINATION]: "# edited in another editor\n" },
  });
  await page.getByRole("checkbox", { name: /reviewed this diff/ }).check();
  await page.getByRole("button", { name: "Apply to file" }).click();
  await expect(page.getByRole("alert").last()).toContainText(
    "destination changed since confirmation",
  );
  expect((await readMockState(page)).files[DESTINATION]).toBe(
    "# edited in another editor\n",
  );
});

test("a symlinked destination is refused before any review", async ({
  page,
}) => {
  await installTauriMock(page, {
    files: { [DESTINATION]: LIVE },
    symlinks: [DESTINATION],
  });
  await openSavedProject(page);
  await reviewApply(page);
  await expect(page.getByRole("alert")).toContainText("symbolic link");
  await expect(page.getByRole("button", { name: "Apply to file" })).toHaveCount(
    0,
  );
  expect((await readMockState(page)).calls).not.toContain("apply_config");
});

test("a new destination is created without a backup", async ({ page }) => {
  await installTauriMock(page);
  await openSavedProject(page);
  await reviewApply(page, "/home/me/.config/ghostty/new-config");
  await page.getByRole("checkbox", { name: /reviewed this diff/ }).check();
  await page.getByRole("button", { name: "Apply to file" }).click();
  await expect(page.getByText(/No backup was needed/)).toBeVisible();
  const state = await readMockState(page);
  expect(state.files["/home/me/.config/ghostty/new-config"]).toContain(
    "font-size = 14",
  );
  expect(state.backups).toHaveLength(0);
});

test("export refuses to replace an existing file", async ({ page }) => {
  await installTauriMock(page, { files: { [DESTINATION]: LIVE } });
  await openSavedProject(page);
  await page.getByLabel("Export path").fill(DESTINATION);
  await page.getByRole("button", { name: "Export config" }).click();
  await expect(
    page.getByText(
      /Use Apply to write a live project path|destination changed/,
    ),
  ).toBeVisible();
  await page.getByLabel("Export path").fill("/tmp/exported.conf");
  await page.getByRole("button", { name: "Export config" }).click();
  await expect(
    page.getByText(/^Exported \d+ bytes to \/tmp\/exported.conf/),
  ).toBeVisible();
});

test("named snapshots can be restored after confirmation", async ({ page }) => {
  await installTauriMock(page);
  await openSavedProject(page);
  await page.getByLabel("Snapshot name").fill("Before change");
  await page.getByRole("button", { name: "Create named snapshot" }).click();
  await expect(page.getByText("Saved snapshot “Before change”.")).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Restore Before change" }).click();
  await expect(page.getByText("Restored “Before change”.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Snapshots" })).toContainText(
    "before-restore",
  );
});
