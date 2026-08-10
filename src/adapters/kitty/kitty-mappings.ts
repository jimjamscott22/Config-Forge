import type { SharedConfig } from "../../domain/shared-config";

type PortableValue = string | number | boolean;

type ParsedValue<T extends PortableValue> =
  { ok: true; value: T } | { ok: false; reason: string };

export interface KittyMapping {
  readonly modelPath: string;
  apply(
    shared: SharedConfig,
    nativeValue: string,
  ): { ok: true } | { ok: false; reason: string };
  matches(shared: SharedConfig, nativeValue: string): boolean;
  serialize(shared: SharedConfig, originalNativeValue?: string): string | null;
}

interface MappingDefinition<T extends PortableValue> {
  readonly modelPath: string;
  parse(nativeValue: string): ParsedValue<T>;
  read(shared: SharedConfig): T | null;
  write(shared: SharedConfig, value: T): void;
  serialize(value: T, originalNativeValue?: string): string;
}

function defineMapping<T extends PortableValue>(
  definition: MappingDefinition<T>,
): KittyMapping {
  return {
    modelPath: definition.modelPath,
    apply(shared, nativeValue) {
      const result = definition.parse(nativeValue);
      if (!result.ok) {
        return result;
      }
      definition.write(shared, result.value);
      return { ok: true };
    },
    matches(shared, nativeValue) {
      const result = definition.parse(nativeValue);
      return result.ok && Object.is(definition.read(shared), result.value);
    },
    serialize(shared, originalNativeValue) {
      const value = definition.read(shared);
      return value === null
        ? null
        : definition.serialize(value, originalNativeValue);
    },
  };
}

function parsed<T extends PortableValue>(value: T): ParsedValue<T> {
  return { ok: true, value };
}

function unsupported<T extends PortableValue>(reason: string): ParsedValue<T> {
  return { ok: false, reason };
}

function parseFontFamily(value: string): ParsedValue<string> {
  if (value === "" || value === "auto" || value.includes("=")) {
    return unsupported(
      "Automatic or extended font specifications are not portable",
    );
  }
  return parsed(value);
}

function parseNumber(value: string): ParsedValue<number> {
  if (value.trim() === "") {
    return unsupported("Expected a number");
  }
  const result = Number(value);
  return Number.isFinite(result)
    ? parsed(result)
    : unsupported("Expected a finite number");
}

function parseInteger(value: string): ParsedValue<number> {
  const result = parseNumber(value);
  if (!result.ok) {
    return result;
  }
  return Number.isInteger(result.value)
    ? result
    : unsupported("Expected an integer");
}

function parseFontSize(value: string): ParsedValue<number> {
  const result = parseNumber(value);
  if (!result.ok) {
    return result;
  }
  return result.value >= 6 && result.value <= 96
    ? result
    : unsupported("Expected a value between 6 and 96");
}

function parseHexColor(value: string): ParsedValue<string> {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value);
  return match?.[1]
    ? parsed(`#${match[1].toLowerCase()}`)
    : unsupported("Only six-digit hex colors are portable");
}

function parseOpacity(value: string): ParsedValue<number> {
  const result = parseNumber(value);
  if (!result.ok) {
    return result;
  }
  return result.value >= 0.1 && result.value <= 1
    ? result
    : unsupported("Expected a value between 0.1 and 1");
}

function parsePadding(value: string): ParsedValue<number> {
  const result = parseInteger(value);
  if (!result.ok) {
    return result;
  }
  return result.value >= 0 && result.value <= 200
    ? result
    : unsupported("Expected an integer between 0 and 200");
}

function parseCursorShape(
  value: string,
): ParsedValue<"block" | "beam" | "underline"> {
  return value === "block" || value === "beam" || value === "underline"
    ? parsed(value)
    : unsupported(`Unsupported portable cursor shape: ${value}`);
}

function serializeCursorShape(value: "block" | "beam" | "underline"): string {
  return value;
}

function parseCursorBlink(value: string): ParsedValue<boolean> {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 1 || parts[0] === undefined) {
    return unsupported("Animated cursor blink intervals are not portable");
  }
  const interval = parseNumber(parts[0]);
  if (!interval.ok) {
    return interval;
  }
  if (interval.value < 0) {
    return unsupported("System-default cursor blinking is not portable");
  }
  return parsed(interval.value > 0);
}

function serializeCursorBlink(value: boolean): string {
  return value ? "0.5" : "0";
}

function parseScrollback(value: string): ParsedValue<number> {
  const result = parseInteger(value);
  if (!result.ok) {
    return result;
  }
  return result.value >= 0 && result.value <= 10_000_000
    ? result
    : unsupported("Expected an integer between 0 and 10000000");
}

const trueValues = new Set(["y", "yes", "true", "on"]);
const falseValues = new Set(["n", "no", "false", "off"]);

function parseBoolean(value: string): ParsedValue<boolean> {
  const normalized = value.toLowerCase();
  if (trueValues.has(normalized)) {
    return parsed(true);
  }
  if (falseValues.has(normalized)) {
    return parsed(false);
  }
  return unsupported("Expected a boolean value");
}

function parseCopyOnSelect(value: string): ParsedValue<boolean> {
  const normalized = value.toLowerCase();
  if (trueValues.has(normalized) || normalized === "clipboard") {
    return parsed(true);
  }
  if (falseValues.has(normalized) || normalized === "") {
    return parsed(false);
  }
  return unsupported("Named copy buffers are not portable");
}

const stringifyString = (value: string): string => value;
const stringifyNumber = (value: number): string => String(value);
const stringifyBoolean = (value: boolean): string => (value ? "yes" : "no");

export const kittyMappings = {
  font_family: defineMapping({
    modelPath: "font.family",
    parse: parseFontFamily,
    read: (shared) => shared.font.family,
    write: (shared, value) => {
      shared.font.family = value;
    },
    serialize: stringifyString,
  }),
  bold_font: defineMapping({
    modelPath: "font.boldFamily",
    parse: parseFontFamily,
    read: (shared) => shared.font.boldFamily,
    write: (shared, value) => {
      shared.font.boldFamily = value;
    },
    serialize: stringifyString,
  }),
  italic_font: defineMapping({
    modelPath: "font.italicFamily",
    parse: parseFontFamily,
    read: (shared) => shared.font.italicFamily,
    write: (shared, value) => {
      shared.font.italicFamily = value;
    },
    serialize: stringifyString,
  }),
  bold_italic_font: defineMapping({
    modelPath: "font.boldItalicFamily",
    parse: parseFontFamily,
    read: (shared) => shared.font.boldItalicFamily,
    write: (shared, value) => {
      shared.font.boldItalicFamily = value;
    },
    serialize: stringifyString,
  }),
  font_size: defineMapping({
    modelPath: "font.size",
    parse: parseFontSize,
    read: (shared) => shared.font.size,
    write: (shared, value) => {
      shared.font.size = value;
    },
    serialize: stringifyNumber,
  }),
  foreground: defineMapping({
    modelPath: "colors.foreground",
    parse: parseHexColor,
    read: (shared) => shared.colors.foreground,
    write: (shared, value) => {
      shared.colors.foreground = value;
    },
    serialize: stringifyString,
  }),
  background: defineMapping({
    modelPath: "colors.background",
    parse: parseHexColor,
    read: (shared) => shared.colors.background,
    write: (shared, value) => {
      shared.colors.background = value;
    },
    serialize: stringifyString,
  }),
  cursor: defineMapping({
    modelPath: "colors.cursor",
    parse: parseHexColor,
    read: (shared) => shared.colors.cursor,
    write: (shared, value) => {
      shared.colors.cursor = value;
    },
    serialize: stringifyString,
  }),
  selection_background: defineMapping({
    modelPath: "colors.selectionBackground",
    parse: parseHexColor,
    read: (shared) => shared.colors.selectionBackground,
    write: (shared, value) => {
      shared.colors.selectionBackground = value;
    },
    serialize: stringifyString,
  }),
  selection_foreground: defineMapping({
    modelPath: "colors.selectionForeground",
    parse: parseHexColor,
    read: (shared) => shared.colors.selectionForeground,
    write: (shared, value) => {
      shared.colors.selectionForeground = value;
    },
    serialize: stringifyString,
  }),
  background_opacity: defineMapping({
    modelPath: "window.opacity",
    parse: parseOpacity,
    read: (shared) => shared.window.opacity,
    write: (shared, value) => {
      shared.window.opacity = value;
    },
    serialize: stringifyNumber,
  }),
  window_padding_width: defineMapping({
    modelPath: "window.paddingX",
    parse: parsePadding,
    read: (shared) => shared.window.paddingX,
    write: (shared, value) => {
      shared.window.paddingX = value;
    },
    serialize: stringifyNumber,
  }),
  cursor_shape: defineMapping({
    modelPath: "cursor.shape",
    parse: parseCursorShape,
    read: (shared) => shared.cursor.shape,
    write: (shared, value) => {
      shared.cursor.shape = value;
    },
    serialize: serializeCursorShape,
  }),
  cursor_blink_interval: defineMapping({
    modelPath: "cursor.blink",
    parse: parseCursorBlink,
    read: (shared) => shared.cursor.blink,
    write: (shared, value) => {
      shared.cursor.blink = value;
    },
    serialize: serializeCursorBlink,
  }),
  scrollback_lines: defineMapping({
    modelPath: "behavior.scrollbackLines",
    parse: parseScrollback,
    read: (shared) => shared.behavior.scrollbackLines,
    write: (shared, value) => {
      shared.behavior.scrollbackLines = value;
    },
    serialize: stringifyNumber,
  }),
  copy_on_select: defineMapping({
    modelPath: "behavior.copyOnSelect",
    parse: parseCopyOnSelect,
    read: (shared) => shared.behavior.copyOnSelect,
    write: (shared, value) => {
      shared.behavior.copyOnSelect = value;
    },
    serialize: stringifyBoolean,
  }),
  enable_audio_bell: defineMapping({
    modelPath: "behavior.visualBell",
    parse: parseBoolean,
    read: (shared) => shared.behavior.visualBell,
    write: (shared, value) => {
      shared.behavior.visualBell = value;
    },
    serialize: stringifyBoolean,
  }),
} as const satisfies Record<string, KittyMapping>;

export type KittySettingKey = keyof typeof kittyMappings;

export function isKittySettingKey(key: string): key is KittySettingKey {
  return Object.hasOwn(kittyMappings, key);
}
