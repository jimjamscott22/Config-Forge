import type { Page } from "@playwright/test";

export type StudioTool =
  "Source" | "Validation" | "Write" | "Export" | "Translate" | "History";

/** Opens the studio side panel on a tab, from the matching top-bar button. */
export async function openTool(page: Page, tab: StudioTool) {
  const panel = page.getByRole("dialog", { name: "Project tools" });
  if (!(await panel.isVisible())) {
    const opener =
      tab === "Source" || tab === "Validation"
        ? page.getByRole("button", { name: "Source", exact: true })
        : page.getByRole("button", { name: "Write to disk" });
    await opener.click();
  }
  await panel.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
}

/** Closes the side panel if it is open. */
export async function closeTools(page: Page) {
  const panel = page.getByRole("dialog", { name: "Project tools" });
  if (await panel.isVisible())
    await panel.getByRole("button", { name: "Close" }).click();
}
