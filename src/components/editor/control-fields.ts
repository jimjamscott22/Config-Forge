import { z } from "zod";
import { allAlacrittyMappings } from "../../adapters/alacritty/alacritty-mappings";
import { ghosttyMappings } from "../../adapters/ghostty/ghostty-mappings";
import { kittyMappings } from "../../adapters/kitty/kitty-mappings";
import { getAdapter } from "../../adapters/registry";
import {
  ansiColorNames,
  sharedConfigSchema,
  type SharedConfig,
  type TerminalId,
} from "../../domain/shared-config";

type FieldKind = "text" | "number" | "color" | "select" | "boolean";
type FieldValue = string | number | boolean | null;
export interface ControlField {
  path: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  read(shared: SharedConfig): FieldValue;
  update(
    shared: SharedConfig,
    text: string,
  ):
    | { success: true; shared: SharedConfig }
    | { success: false; message: string };
}

function defineField<T>(
  path: string,
  label: string,
  kind: FieldKind,
  schema: z.ZodType<T>,
  read: (shared: SharedConfig) => FieldValue,
  write: (shared: SharedConfig, value: T) => void,
  options?: readonly string[],
): ControlField {
  return {
    path,
    label,
    kind,
    options,
    read,
    update(shared, text) {
      const raw = text.trim();
      if (/[\r\n]/.test(text)) {
        return { success: false, message: "Use a single-line value." };
      }
      let input: unknown = raw === "" ? null : raw;
      if (raw !== "" && kind === "number") {
        input = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) ? Number(raw) : NaN;
      } else if (raw !== "" && kind === "boolean") {
        input = raw === "true" ? true : raw === "false" ? false : raw;
      }
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        return {
          success: false,
          message: parsed.error.issues[0]?.message ?? "Invalid value.",
        };
      }
      const next = structuredClone(shared);
      write(next, parsed.data);
      return { success: true, shared: next };
    },
  };
}

function leaf<G extends keyof SharedConfig, K extends keyof SharedConfig[G]>(
  group: G,
  key: K,
  label: string,
  kind: FieldKind,
  schema: z.ZodType<SharedConfig[G][K]>,
  options?: readonly string[],
): ControlField {
  return defineField(
    `${group}.${String(key)}`,
    label,
    kind,
    schema,
    (shared) => {
      const value: unknown = shared[group][key];
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      )
        return value;
      throw new Error("Expected a scalar control field.");
    },
    (shared, value) => {
      shared[group][key] = value;
    },
    options,
  );
}

const {
  font,
  colors,
  window: windowSchema,
  cursor,
  behavior,
} = sharedConfigSchema.shape;
export const fontFields = [
  leaf("font", "family", "Font family", "text", font.shape.family),
  leaf("font", "size", "Font size (pt)", "number", font.shape.size),
  leaf("font", "boldFamily", "Bold font family", "text", font.shape.boldFamily),
  leaf(
    "font",
    "italicFamily",
    "Italic font family",
    "text",
    font.shape.italicFamily,
  ),
  leaf(
    "font",
    "boldItalicFamily",
    "Bold italic font family",
    "text",
    font.shape.boldItalicFamily,
  ),
];
export const appearanceFields = [
  leaf(
    "window",
    "opacity",
    "Opacity (0.1–1)",
    "number",
    windowSchema.shape.opacity,
  ),
  leaf(
    "window",
    "paddingX",
    "Horizontal padding (px)",
    "number",
    windowSchema.shape.paddingX,
  ),
  leaf(
    "window",
    "paddingY",
    "Vertical padding (px)",
    "number",
    windowSchema.shape.paddingY,
  ),
  leaf(
    "window",
    "decorations",
    "Window decorations",
    "select",
    windowSchema.shape.decorations,
    ["system", "client", "none"],
  ),
  leaf("cursor", "shape", "Cursor shape", "select", cursor.shape.shape, [
    "block",
    "beam",
    "underline",
  ]),
  leaf("cursor", "blink", "Blinking cursor", "boolean", cursor.shape.blink),
];
export const colorFields = [
  leaf("colors", "foreground", "Foreground", "color", colors.shape.foreground),
  leaf("colors", "background", "Background", "color", colors.shape.background),
  leaf("colors", "cursor", "Cursor color", "color", colors.shape.cursor),
  leaf("colors", "cursorText", "Cursor text", "color", colors.shape.cursorText),
  leaf(
    "colors",
    "selectionBackground",
    "Selection background",
    "color",
    colors.shape.selectionBackground,
  ),
  leaf(
    "colors",
    "selectionForeground",
    "Selection foreground",
    "color",
    colors.shape.selectionForeground,
  ),
];
export const ansiFields = ansiColorNames.map((name) =>
  defineField(
    `colors.ansi.${name}`,
    `ANSI ${name.replace(/^bright/, "bright ")}`,
    "color",
    colors.shape.foreground,
    (shared) => shared.colors.ansi[name] ?? null,
    (shared, value) => {
      if (value === null) delete shared.colors.ansi[name];
      else shared.colors.ansi[name] = value;
    },
  ),
);
export const behaviorFields = [
  leaf(
    "behavior",
    "scrollbackLines",
    "Scrollback limit",
    "number",
    behavior.shape.scrollbackLines,
  ),
  leaf(
    "behavior",
    "visualBell",
    "Visual bell",
    "boolean",
    behavior.shape.visualBell,
  ),
  leaf(
    "behavior",
    "attentionOnBell",
    "Attention on bell",
    "boolean",
    behavior.shape.attentionOnBell,
  ),
  leaf(
    "behavior",
    "copyOnSelect",
    "Copy on selection",
    "boolean",
    behavior.shape.copyOnSelect,
  ),
  leaf(
    "behavior",
    "middleClickPaste",
    "Middle-click paste",
    "boolean",
    behavior.shape.middleClickPaste,
  ),
  leaf(
    "behavior",
    "confirmClose",
    "Confirm close",
    "boolean",
    behavior.shape.confirmClose,
  ),
];

const terminals: TerminalId[] = ["ghostty", "kitty", "alacritty"];
export function fieldSupport(terminal: TerminalId, path: string) {
  const supported = getAdapter(terminal).supportedSharedPaths().includes(path);
  const portableTo = terminals.filter(
    (id) =>
      id !== terminal && getAdapter(id).supportedSharedPaths().includes(path),
  );
  const native =
    terminal === "ghostty"
      ? Object.entries(ghosttyMappings).find(
          ([, mapping]) => mapping.modelPath === path,
        )?.[0]
      : terminal === "kitty"
        ? Object.entries(kittyMappings).find(
            ([, mapping]) => mapping.modelPath === path,
          )?.[0]
        : allAlacrittyMappings().find(
            (mapping) =>
              mapping.modelPath === path ||
              (mapping.modelPath === "window.padding" &&
                (path === "window.paddingX" || path === "window.paddingY")),
          )?.settingPath;
  return { supported, portableTo, native };
}
