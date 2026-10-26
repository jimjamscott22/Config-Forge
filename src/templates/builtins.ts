import { configTemplateSchema, type ConfigTemplate } from "../domain/template";
import type { SharedConfig } from "../domain/shared-config";

type Ansi = NonNullable<SharedConfig["colors"]["ansi"]>;
type Overrides = {
  [Section in keyof SharedConfig]?: Partial<SharedConfig[Section]>;
};

function shared(overrides: Overrides = {}): SharedConfig {
  return {
    font: {
      family: null,
      boldFamily: null,
      italicFamily: null,
      boldItalicFamily: null,
      size: null,
      ...overrides.font,
    },
    colors: {
      foreground: null,
      background: null,
      cursor: null,
      cursorText: null,
      selectionBackground: null,
      selectionForeground: null,
      ansi: {},
      ...overrides.colors,
    },
    window: {
      opacity: null,
      paddingX: null,
      paddingY: null,
      decorations: null,
      ...overrides.window,
    },
    cursor: { shape: null, blink: null, ...overrides.cursor },
    behavior: {
      scrollbackLines: null,
      visualBell: null,
      attentionOnBell: null,
      copyOnSelect: null,
      middleClickPaste: null,
      confirmClose: null,
      ...overrides.behavior,
    },
  };
}

function ansi(normal: string[], bright: string[]): Ansi {
  const names = [
    "black",
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "cyan",
    "white",
  ] as const;
  const entries: Ansi = {};
  names.forEach((name, index) => {
    entries[name] = normal[index];
    const brightName =
      `bright${name[0]?.toUpperCase()}${name.slice(1)}` as keyof Ansi;
    entries[brightName] = bright[index];
  });
  return entries;
}

function template(
  id: string,
  name: string,
  description: string,
  config: SharedConfig,
): ConfigTemplate {
  return configTemplateSchema.parse({
    id: `builtin-${id}`,
    name,
    description,
    terminal: "portable",
    builtIn: true,
    shared: config,
    overrides: {},
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Original first-party palettes only. Do not add third-party-derived schemes
// until license and attribution review is complete.
export const builtinTemplates: readonly ConfigTemplate[] = deepFreeze([
  template(
    "blank",
    "Blank",
    "No explicit settings; the terminal's defaults.",
    shared(),
  ),
  template(
    "modern-dark",
    "Modern Dark",
    "Soft charcoal background with warm amber cursor.",
    shared({
      colors: {
        foreground: "#d4d7dd",
        background: "#171a21",
        cursor: "#f2b866",
        selectionBackground: "#2d3548",
        selectionForeground: "#f0f2f5",
        ansi: ansi(
          [
            "#20242d",
            "#e5646e",
            "#7fc787",
            "#e2c26b",
            "#6a9fe8",
            "#b88ae0",
            "#5cc5c9",
            "#c9ced6",
          ],
          [
            "#4b5263",
            "#f2848d",
            "#98d99f",
            "#f0d58a",
            "#8bb7f0",
            "#cfa6f0",
            "#82d9dc",
            "#eef0f4",
          ],
        ),
      },
      cursor: { shape: "block", blink: false },
    }),
  ),
  template(
    "modern-light",
    "Modern Light",
    "Warm paper background with dark ink and a copper cursor.",
    shared({
      colors: {
        foreground: "#2b2f36",
        background: "#fbfaf7",
        cursor: "#b3541e",
        selectionBackground: "#d9e2f2",
        selectionForeground: "#1d2127",
        ansi: ansi(
          [
            "#2b2f36",
            "#b3262e",
            "#2f7a3d",
            "#8a6a0c",
            "#2559b5",
            "#7a3fb0",
            "#17737b",
            "#d6d6d0",
          ],
          [
            "#5d6470",
            "#d4414a",
            "#43995a",
            "#a8841a",
            "#3f7ad6",
            "#9a5fd0",
            "#2b95a0",
            "#f3f1ea",
          ],
        ),
      },
      cursor: { shape: "block", blink: false },
    }),
  ),
  template(
    "high-contrast-dark",
    "High Contrast Dark",
    "Pure black and white with saturated colors for maximum legibility.",
    shared({
      colors: {
        foreground: "#ffffff",
        background: "#000000",
        cursor: "#ffff00",
        selectionBackground: "#ffffff",
        selectionForeground: "#000000",
        ansi: ansi(
          [
            "#000000",
            "#ff4040",
            "#40ff40",
            "#ffff40",
            "#6e9bff",
            "#ff6eff",
            "#40ffff",
            "#e0e0e0",
          ],
          [
            "#808080",
            "#ff8080",
            "#80ff80",
            "#ffff80",
            "#9dbcff",
            "#ff9dff",
            "#80ffff",
            "#ffffff",
          ],
        ),
      },
      cursor: { shape: "block", blink: false },
    }),
  ),
  template(
    "high-contrast-light",
    "High Contrast Light",
    "Black on white with deep colors for maximum legibility.",
    shared({
      colors: {
        foreground: "#000000",
        background: "#ffffff",
        cursor: "#0000cc",
        selectionBackground: "#000000",
        selectionForeground: "#ffffff",
        ansi: ansi(
          [
            "#000000",
            "#a00000",
            "#006000",
            "#605000",
            "#0000b0",
            "#800080",
            "#006060",
            "#c0c0c0",
          ],
          [
            "#404040",
            "#d00000",
            "#008000",
            "#807000",
            "#0000e0",
            "#a000a0",
            "#008080",
            "#e8e8e8",
          ],
        ),
      },
      cursor: { shape: "block", blink: false },
    }),
  ),
  template(
    "retro-green",
    "Retro Green",
    "Phosphor green on near-black with a blinking block cursor.",
    shared({
      colors: {
        foreground: "#3dff6b",
        background: "#031006",
        cursor: "#7dff9b",
        selectionBackground: "#0f4d1f",
        selectionForeground: "#b8ffc8",
        ansi: ansi(
          [
            "#031006",
            "#e0603c",
            "#3dff6b",
            "#c8e63c",
            "#2fa87a",
            "#7fcf9a",
            "#3de0b0",
            "#a8e8b8",
          ],
          [
            "#14602a",
            "#ff8a66",
            "#7dff9b",
            "#e6ff6a",
            "#55c9a0",
            "#a8ecc0",
            "#7dffd2",
            "#d8ffe2",
          ],
        ),
      },
      cursor: { shape: "block", blink: true },
    }),
  ),
  template(
    "presentation",
    "Presentation",
    "Large type, generous padding, and high-contrast colors for projectors.",
    shared({
      font: { size: 20 },
      colors: {
        foreground: "#f5f7fa",
        background: "#101418",
        cursor: "#ffd166",
      },
      window: { paddingX: 24, paddingY: 18 },
      cursor: { shape: "block", blink: false },
      behavior: { scrollbackLines: 2000 },
    }),
  ),
  template(
    "minimal",
    "Minimal",
    "Quiet defaults: steady beam cursor, no visual bell, tight padding.",
    shared({
      font: { size: 12 },
      window: { paddingX: 6, paddingY: 4 },
      cursor: { shape: "beam", blink: false },
      behavior: { scrollbackLines: 5000, visualBell: false },
    }),
  ),
]);

export function getBuiltinTemplate(id: string): ConfigTemplate | undefined {
  return builtinTemplates.find((template) => template.id === id);
}
