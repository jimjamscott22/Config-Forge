import { expect, test } from "vitest";
import { makeProject } from "../../services/project-service";
import { changedFields, fontFields } from "./control-fields";

const sizeField = fontFields.find((field) => field.path === "font.size")!;

test("changedFields returns only fields that differ from the baseline", () => {
  const saved = makeProject({
    terminal: "ghostty",
    name: "Draft",
    source: "font-size = 12\n",
  });
  const edited = sizeField.update(saved.shared, "13");
  if (!edited.success) throw new Error(edited.message);
  expect(changedFields(edited.shared, saved.shared).map((f) => f.path)).toEqual(
    ["font.size"],
  );
  expect(changedFields(saved.shared, saved.shared)).toEqual([]);
});

test("changedFields is empty without a baseline", () => {
  const project = makeProject({ terminal: "kitty", name: "Draft" });
  expect(changedFields(project.shared, null)).toEqual([]);
});
