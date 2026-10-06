import { expect, test } from "vitest";
import { makeProject } from "../../services/project-service";
import { buildPreviewModel } from "./preview-model";

test("models configured color, typography, padding, opacity, selection and cursor without mutating shared settings", () => {
  const shared = makeProject({ name: "Preview", terminal: "ghostty" }).shared;
  shared.colors = {
    ...shared.colors,
    foreground: "#c6d0f5",
    background: "#303446",
    cursor: "#f2d5cf",
    selectionBackground: "#445566",
    ansi: { green: "#11aa22" },
  };
  shared.font.family = "Iosevka";
  shared.font.size = 14;
  shared.window = {
    ...shared.window,
    opacity: 0.92,
    paddingX: 10,
    paddingY: 12,
  };
  shared.cursor = { shape: "beam", blink: true };
  const original = structuredClone(shared);
  const model = buildPreviewModel(shared);
  expect(model.style).toMatchObject({
    color: "#c6d0f5",
    backgroundColor: "#303446",
    opacity: 0.92,
    paddingInline: "10px",
    paddingBlock: "12px",
    fontFamily: '"Iosevka", monospace',
    fontSize: "14pt",
    "--preview-cursor": "#f2d5cf",
    "--preview-selection-background": "#445566",
  });
  expect(model.palette).toHaveLength(16);
  expect(model.palette[2]).toEqual({ name: "green", color: "#11aa22" });
  expect(model).toMatchObject({ cursorShape: "beam", cursorBlink: true });
  expect(shared).toEqual(original);
});

test("unset settings have illustrative defaults and Kitty padding uses both axes", () => {
  const shared = makeProject({ name: "Preview", terminal: "kitty" }).shared;
  expect(buildPreviewModel(shared).style).toMatchObject({
    opacity: 1,
    paddingInline: "16px",
    paddingBlock: "16px",
  });
  shared.window.paddingX = 9;
  expect(buildPreviewModel(shared, "kitty").style.paddingBlock).toBe("9px");
  expect(shared.window.paddingY).toBeNull();
});
