import type { SharedConfig } from "../../domain/shared-config";

type PortableValue = string | number | boolean;

type ParsedValue<T extends PortableValue> =
  { ok: true; value: T } | { ok: false; reason: string };

export interface GhosttyMapping {
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
): GhosttyMapping {
  return {
    modelPath: definition.modelPath,
    apply(shared, nativeValue) {
      const parsed = definition.parse(nativeValue);
      if (!parsed.ok) {
        return parsed;
      }

      definition.write(shared, parsed.value);
      return { ok: true };
    },
    matches(shared, nativeValue) {
      const parsed = definition.parse(nativeValue);
      return parsed.ok && Object.is(definition.read(shared), parsed.value);
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

function parseNonEmptyString(value: string): ParsedValue<string> {
  return value.length > 0
    ? parsed(value)
    : unsupported("Expected a non-empty value");
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

function parseBoolean(value: string): ParsedValue<boolean> {
  if (value === "true") {
    return parsed(true);
  }
  if (value === "false") {
    return parsed(false);
  }
  return unsupported('Expected "true" or "false"');
}

function parseHexColor(value: string): ParsedValue<string> {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value);
  return match?.[1]
    ? parsed(`#${match[1].toLowerCase()}`)
    : unsupported("Expected a six-digit hex color");
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
  if (value.includes(",")) {
    return unsupported("Asymmetric padding is not portable");
  }

  const result = parseInteger(value);
  if (!result.ok) {
    return result;
  }
  return result.value >= 0 && result.value <= 200
    ? result
    : unsupported("Expected an integer between 0 and 200");
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

function parseScrollback(value: string): ParsedValue<number> {
  const result = parseInteger(value);
  if (!result.ok) {
    return result;
  }
  return result.value >= 0 && result.value <= 10_000_000
    ? result
    : unsupported("Expected an integer between 0 and 10000000");
}

function parseCursorShape(
  value: string,
): ParsedValue<"block" | "beam" | "underline"> {
  if (value === "block" || value === "underline") {
    return parsed(value);
  }
  if (value === "bar") {
    return parsed("beam");
  }
  return unsupported(`Unsupported portable cursor style: ${value}`);
}

function serializeCursorShape(value: "block" | "beam" | "underline"): string {
  return value === "beam" ? "bar" : value;
}

function bellFeatureTokens(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseAttentionOnBell(value: string): ParsedValue<boolean> {
  const tokens = bellFeatureTokens(value);
  if (tokens.includes("no-attention")) {
    return parsed(false);
  }
  return parsed(true);
}

function serializeAttentionOnBell(
  enabled: boolean,
  originalNativeValue?: string,
): string {
  if (originalNativeValue !== undefined) {
    const original = parseAttentionOnBell(originalNativeValue);
    if (original.ok && original.value === enabled) {
      return originalNativeValue;
    }
  }

  const tokens = bellFeatureTokens(originalNativeValue ?? "").filter(
    (token) => token !== "attention" && token !== "no-attention",
  );
  tokens.push(enabled ? "attention" : "no-attention");
  return tokens.join(",");
}

const stringifyString = (value: string): string => value;
const stringifyNumber = (value: number): string => String(value);
const stringifyBoolean = (value: boolean): string => String(value);

export const ghosttyMappings = {
  "font-family": defineMapping({
    modelPath: "font.family",
    parse: parseNonEmptyString,
    read: (shared) => shared.font.family,
    write: (shared, value) => {
      shared.font.family = value;
    },
    serialize: stringifyString,
  }),
  "font-size": defineMapping({
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
  "cursor-color": defineMapping({
    modelPath: "colors.cursor",
    parse: parseHexColor,
    read: (shared) => shared.colors.cursor,
    write: (shared, value) => {
      shared.colors.cursor = value;
    },
    serialize: stringifyString,
  }),
  "selection-background": defineMapping({
    modelPath: "colors.selectionBackground",
    parse: parseHexColor,
    read: (shared) => shared.colors.selectionBackground,
    write: (shared, value) => {
      shared.colors.selectionBackground = value;
    },
    serialize: stringifyString,
  }),
  "selection-foreground": defineMapping({
    modelPath: "colors.selectionForeground",
    parse: parseHexColor,
    read: (shared) => shared.colors.selectionForeground,
    write: (shared, value) => {
      shared.colors.selectionForeground = value;
    },
    serialize: stringifyString,
  }),
  "background-opacity": defineMapping({
    modelPath: "window.opacity",
    parse: parseOpacity,
    read: (shared) => shared.window.opacity,
    write: (shared, value) => {
      shared.window.opacity = value;
    },
    serialize: stringifyNumber,
  }),
  "window-padding-x": defineMapping({
    modelPath: "window.paddingX",
    parse: parsePadding,
    read: (shared) => shared.window.paddingX,
    write: (shared, value) => {
      shared.window.paddingX = value;
    },
    serialize: stringifyNumber,
  }),
  "window-padding-y": defineMapping({
    modelPath: "window.paddingY",
    parse: parsePadding,
    read: (shared) => shared.window.paddingY,
    write: (shared, value) => {
      shared.window.paddingY = value;
    },
    serialize: stringifyNumber,
  }),
  "cursor-style": defineMapping({
    modelPath: "cursor.shape",
    parse: parseCursorShape,
    read: (shared) => shared.cursor.shape,
    write: (shared, value) => {
      shared.cursor.shape = value;
    },
    serialize: serializeCursorShape,
  }),
  "cursor-style-blink": defineMapping({
    modelPath: "cursor.blink",
    parse: parseBoolean,
    read: (shared) => shared.cursor.blink,
    write: (shared, value) => {
      shared.cursor.blink = value;
    },
    serialize: stringifyBoolean,
  }),
  "scrollback-limit": defineMapping({
    modelPath: "behavior.scrollbackLines",
    parse: parseScrollback,
    read: (shared) => shared.behavior.scrollbackLines,
    write: (shared, value) => {
      shared.behavior.scrollbackLines = value;
    },
    serialize: stringifyNumber,
  }),
  "bell-features": defineMapping({
    modelPath: "behavior.attentionOnBell",
    parse: parseAttentionOnBell,
    read: (shared) => shared.behavior.attentionOnBell,
    write: (shared, value) => {
      shared.behavior.attentionOnBell = value;
    },
    serialize: serializeAttentionOnBell,
  }),
} as const satisfies Record<string, GhosttyMapping>;

export type GhosttySettingKey = keyof typeof ghosttyMappings;

export function isGhosttySettingKey(key: string): key is GhosttySettingKey {
  return Object.hasOwn(ghosttyMappings, key);
}
