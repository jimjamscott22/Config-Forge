import { expect, test } from "vitest";
import { makeProject } from "../../services/project-service";
import { diffSourceLines, reconcileSourceEdit } from "./source-reconcile";

const ghostty = (
  source = "font-size = 13\n# keep me\nfuture-setting = keep\n",
) => makeProject({ name: "Ghostty", terminal: "ghostty", source });

test("maps a recognized source edit back into shared settings", () => {
  const project = ghostty("");
  const result = reconcileSourceEdit(
    project,
    "font-family = Iosevka\nfont-size = 14\n",
  );

  expect(result.applicable).toBe(true);
  expect(result.project.id).toBe(project.id);
  expect(result.project.shared.font.family).toBe("Iosevka");
  expect(result.project.shared.font.size).toBe(14);
  expect(result.requiresConfirmation).toBe(false);
});

test("warns when a raw edit introduces an unknown setting", () => {
  const result = reconcileSourceEdit(
    ghostty(""),
    "font-family = Iosevka\nexperimental-option = yes\n",
  );

  expect(result.requiresConfirmation).toBe(true);
  expect(result.unmappedAdded).toHaveLength(1);
  expect(result.project.document.map((node) => node.originalText)).toContain(
    "experimental-option = yes",
  );
});

test("already-preserved content does not need confirmation; removing it is reported", () => {
  const project = ghostty();
  const kept = reconcileSourceEdit(
    project,
    "font-size = 15\n# keep me\nfuture-setting = keep\n",
  );
  expect(kept.requiresConfirmation).toBe(false);
  expect(kept.unmappedAdded).toHaveLength(0);
  expect(kept.project.shared.font.size).toBe(15);

  const removed = reconcileSourceEdit(project, "font-size = 13\n");
  expect(removed.unmappedRemoved).toHaveLength(1);
  expect(removed.requiresConfirmation).toBe(false);
});

test("malformed lines require confirmation", () => {
  const result = reconcileSourceEdit(ghostty(""), "font-size ???\n");
  expect(result.unmappedAdded.map((node) => node.kind)).toEqual(["malformed"]);
  expect(result.requiresConfirmation).toBe(true);
});

test("parse errors leave the project untouched and not applicable", () => {
  const project = makeProject({
    name: "Alacritty",
    terminal: "alacritty",
    source: "[font]\nsize = 12\n",
  });
  const result = reconcileSourceEdit(project, "[font\nsize = \n");

  expect(result.applicable).toBe(false);
  expect(result.project).toBe(project);
  expect(result.issues.some((issue) => issue.severity === "error")).toBe(true);
});

test("diffSourceLines labels added, removed, and unchanged lines", () => {
  expect(diffSourceLines("a\nb\n", "a\nc\n")).toEqual([
    { kind: "unchanged", text: "a" },
    { kind: "removed", text: "b" },
    { kind: "added", text: "c" },
  ]);
  expect(diffSourceLines(null, "x\n")).toEqual([{ kind: "added", text: "x" }]);
});
