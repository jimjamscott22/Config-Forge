// Records docs/media/demo.webm by driving the frontend in Chromium with the
// same in-memory Tauri stand-in the Playwright specs use (no real file writes).
// Usage: node scripts/record-demo.mjs   (starts `npm run dev` if 1420 is down)
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { installTauriMock } from "../tests/e2e/support/tauri-mock.ts";

const URL = "http://127.0.0.1:1420";
const OUT = path.resolve("docs/media");
const TMP = path.resolve("docs/media/.rec");
const DESTINATION = "/home/me/.config/ghostty/config";
const LIVE = "# live config\nfont-size = 11\nbackground = #1e1e2e\n";
const SOURCE = [
  "# my ghostty config",
  "font-family = JetBrains Mono",
  "font-size = 11",
  "background = #1e1e2e",
  "foreground = #cdd6f4",
  "cursor-style = block",
  "future-setting = keep-me",
  "",
].join("\n");

const pause = (page, ms = 900) => page.waitForTimeout(ms);
const top = (page) => page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));

async function isUp() {
  try {
    return (await fetch(URL)).ok;
  } catch {
    return false;
  }
}

let server;
if (!(await isUp())) {
  server = spawn("npm run dev -- --host 127.0.0.1", {
    shell: true,
    stdio: "ignore",
  });
  for (let i = 0; i < 60 && !(await isUp()); i += 1)
    await new Promise((r) => setTimeout(r, 500));
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: TMP, size: { width: 1280, height: 900 } },
});
const page = await context.newPage();

try {
  await installTauriMock(page, { files: { [DESTINATION]: LIVE } });
  await page.goto(URL);
  await pause(page, 1500);

  // 1. Import an existing config.
  await page
    .getByRole("button", { name: "Import Existing Config", exact: true })
    .click();
  await pause(page, 600);
  await page.getByLabel("Project name").fill("My Ghostty");
  await page.getByLabel("Terminal", { exact: true }).selectOption("ghostty");
  await page.getByLabel("Configuration source").fill(SOURCE);
  await pause(page, 1200);
  await page.getByRole("button", { name: "Open draft" }).click();
  await top(page);
  await pause(page, 1500);

  // 2. Edit visually; the mock terminal preview updates.
  const controls = page.getByRole("tab", { name: "Controls", exact: true });
  if (await controls.count()) await controls.click();
  const size = page.getByLabel("Font size (pt)", { exact: true });
  await size.fill("");
  await size.pressSequentially("16", { delay: 150 });
  await pause(page, 900);
  await page.getByText("Colors", { exact: true }).click();
  await pause(page, 500);
  await page.getByLabel("Background", { exact: true }).fill("#303446");
  await pause(page, 1200);
  await page.getByText("Window & cursor", { exact: true }).click();
  await page.getByLabel("Cursor shape", { exact: true }).selectOption("beam");
  await pause(page, 1500);

  await top(page);
  // 3. Unknown settings and comments survive in the source.
  const sourceTab = page.getByRole("tab", { name: "Source", exact: true });
  if (await sourceTab.count()) await sourceTab.click();
  await pause(page, 2200);

  // 4. Save, then translate to Kitty.
  await page.getByRole("button", { name: "Save project" }).click();
  await page.locator(".draft-badge").getByText("Saved").waitFor();
  await pause(page, 800);
  await page.getByLabel("Translate to", { exact: true }).selectOption("kitty");
  await page.getByRole("button", { name: "Translate to new project" }).click();
  await page
    .getByRole("region", { name: "Translation report" })
    .waitFor();
  await pause(page, 3000);

  // 5. The source project is still open: review a safe apply.
  await page.getByLabel("Destination path").fill(DESTINATION);
  await pause(page, 600);
  await page.getByRole("button", { name: "Review changes" }).click();
  await page.getByText("Live config → Candidate").waitFor();
  await pause(page, 3000);
  await page.getByRole("checkbox", { name: /reviewed this diff/ }).check();
  await pause(page, 800);
  await page.getByRole("button", { name: "Apply to file" }).click();
  await page.getByText(/^Applied to \/home\/me/).waitFor();
  await pause(page, 3000);
} finally {
  await context.close();
  await browser.close();
  server?.kill();
  if (server && process.platform === "win32")
    spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
      stdio: "ignore",
    });
}

const [video] = readdirSync(TMP).filter((f) => f.endsWith(".webm"));
if (!video) throw new Error("no video was recorded");
renameSync(path.join(TMP, video), path.join(OUT, "demo.webm"));
rmSync(TMP, { recursive: true, force: true });
console.log(`Wrote ${path.join(OUT, "demo.webm")}`);
