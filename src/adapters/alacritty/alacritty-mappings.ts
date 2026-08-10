import { stringify as stringifyToml } from "@iarna/toml";
import type { AnsiColorName, SharedConfig } from "../../domain/shared-config";

type PortableValue = string | number | boolean | PaddingValue;

interface PaddingValue {
  x: number;
  y: number;
}

type ParsedValue<T extends PortableValue> =
  { ok: true; value: T } | { ok: false; reason: string };

export interface AlacrittyMapping {
  readonly table: string;
  readonly key: string;
  readonly settingPath: string;
  readonly modelPath: string;
  apply(
    shared: SharedConfig,
    nativeValue: unknown,
  ): { ok: true } | { ok: false; reason: string };
  matches(shared: SharedConfig, nativeValue: unknown): boolean;
  serialize(shared: SharedConfig): string | null;
}

interface MappingDefinition<T extends PortableValue> {
  readonly table: string;
  readonly key: string;
  readonly modelPath: string;
  parse(nativeValue: unknown): ParsedValue<T>;
  read(shared: SharedConfig): T | null;
  write(shared: SharedConfig, value: T): void;
  serialize(value: T): string;
  equals?(left: T, right: T): boolean;
}

function defineMapping<T extends PortableValue>(
  definition: MappingDefinition<T>,
): AlacrittyMapping {
  const settingPath = `${definition.table}.${definition.key}`;
  return {
    table: definition.table,
    key: definition.key,
    settingPath,
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
      const portableValue = definition.read(shared);
      if (!result.ok || portableValue === null) {
        return false;
      }
      return definition.equals
        ? definition.equals(portableValue, result.value)
        : Object.is(portableValue, result.value);
    },
    serialize(shared) {
      const value = definition.read(shared);
      return value === null ? null : definition.serialize(value);
    },
  };
}

function parsed<T extends PortableValue>(value: T): ParsedValue<T> {
  return { ok: true, value };
}

function unsupported<T extends PortableValue>(reason: string): ParsedValue<T> {
  return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNonEmptyString(value: unknown): ParsedValue<string> {
  return typeof value === "string" && value.length > 0
    ? parsed(value)
    : unsupported("Expected a non-empty string");
}

function parseFiniteNumber(value: unknown): ParsedValue<number> {
  return typeof value === "number" && Number.isFinite(value)
    ? parsed(value)
    : unsupported("Expected a finite number");
}

function parseInteger(value: unknown): ParsedValue<number> {
  const result = parseFiniteNumber(value);
  if (!result.ok) {
    return result;
  }
  return Number.isInteger(result.value)
    ? result
    : unsupported("Expected an integer");
}

function parseFontSize(value: unknown): ParsedValue<number> {
  const result = parseFiniteNumber(value);
  if (!result.ok) {
    return result;
  }
  return result.value >= 6 && result.value <= 96
    ? result
    : unsupported("Expected a value between 6 and 96");
}

function parseHexColor(value: unknown): ParsedValue<string> {
  if (typeof value !== "string") {
    return unsupported("Expected a six-digit hex color string");
  }
  const match = /^#([0-9a-fA-F]{6})$/.exec(value);
  return match?.[1]
    ? parsed(`#${match[1].toLowerCase()}`)
    : unsupported("Expected a six-digit hex color string");
}

function parseOpacity(value: unknown): ParsedValue<number> {
  const result = parseFiniteNumber(value);
  if (!result.ok) {
    return result;
  }
  return result.value >= 0.1 && result.value <= 1
    ? result
    : unsupported("Expected a value between 0.1 and 1");
}

function parsePaddingComponent(value: unknown): ParsedValue<number> {
  const result = parseInteger(value);
  if (!result.ok) {
    return result;
  }
  return result.value >= 0 && result.value <= 200
    ? result
    : unsupported("Expected an integer between 0 and 200");
}

function parsePadding(value: unknown): ParsedValue<PaddingValue> {
  if (!isRecord(value)) {
    return unsupported("Expected an inline padding table");
  }
  const x = parsePaddingComponent(value.x ?? 0);
  const y = parsePaddingComponent(value.y ?? 0);
  if (!x.ok) {
    return unsupported(`Invalid x padding: ${x.reason}`);
  }
  if (!y.ok) {
    return unsupported(`Invalid y padding: ${y.reason}`);
  }
  return parsed({ x: x.value, y: y.value });
}

function parseDecorations(value: unknown): ParsedValue<"system" | "none"> {
  if (value === "Full") {
    return parsed("system");
  }
  if (value === "None") {
    return parsed("none");
  }
  return unsupported(
    `Unsupported portable window decorations: ${String(value)}`,
  );
}

function parseCursorShape(
  value: unknown,
): ParsedValue<"block" | "beam" | "underline"> {
  if (value === "Block") {
    return parsed("block");
  }
  if (value === "Beam") {
    return parsed("beam");
  }
  if (value === "Underline") {
    return parsed("underline");
  }
  return unsupported(`Unsupported portable cursor shape: ${String(value)}`);
}

function parseCursorBlink(value: unknown): ParsedValue<boolean> {
  if (value === "On" || value === "Always") {
    return parsed(true);
  }
  if (value === "Off" || value === "Never") {
    return parsed(false);
  }
  return unsupported(
    `Unsupported portable cursor blinking mode: ${String(value)}`,
  );
}

function parseScrollback(value: unknown): ParsedValue<number> {
  const result = parseInteger(value);
  if (!result.ok) {
    return result;
  }
  return result.value >= 0 && result.value <= 10_000_000
    ? result
    : unsupported("Expected an integer between 0 and 10000000");
}

function parseBoolean(value: unknown): ParsedValue<boolean> {
  return typeof value === "boolean"
    ? parsed(value)
    : unsupported("Expected a boolean");
}

function parseBellDuration(value: unknown): ParsedValue<boolean> {
  const result = parseInteger(value);
  if (!result.ok) {
    return result;
  }
  return result.value >= 0
    ? parsed(result.value > 0)
    : unsupported("Expected a non-negative duration");
}

function serializeString(value: string): string {
  return stringifyToml.value(value);
}

function serializeNumber(value: number): string {
  return String(value);
}

function serializeBoolean(value: boolean): string {
  return String(value);
}

function serializePadding(value: PaddingValue): string {
  return `{ x = ${value.x}, y = ${value.y} }`;
}

function serializeDecorations(value: "system" | "none"): string {
  return serializeString(value === "system" ? "Full" : "None");
}

function serializeCursorShape(value: "block" | "beam" | "underline"): string {
  const nativeValue = {
    block: "Block",
    beam: "Beam",
    underline: "Underline",
  }[value];
  return serializeString(nativeValue);
}

function serializeCursorBlink(value: boolean): string {
  return serializeString(value ? "On" : "Off");
}

function serializeBellDuration(value: boolean): string {
  return value ? "150" : "0";
}

function fontFamilyMapping(
  table: "font.normal" | "font.bold" | "font.italic" | "font.bold_italic",
  modelPath:
    | "font.family"
    | "font.boldFamily"
    | "font.italicFamily"
    | "font.boldItalicFamily",
  read: (shared: SharedConfig) => string | null,
  write: (shared: SharedConfig, value: string) => void,
): AlacrittyMapping {
  return defineMapping({
    table,
    key: "family",
    modelPath,
    parse: parseNonEmptyString,
    read,
    write,
    serialize: serializeString,
  });
}

function colorMapping(
  table: string,
  key: string,
  modelPath: string,
  read: (shared: SharedConfig) => string | null,
  write: (shared: SharedConfig, value: string) => void,
): AlacrittyMapping {
  return defineMapping({
    table,
    key,
    modelPath,
    parse: parseHexColor,
    read,
    write,
    serialize: serializeString,
  });
}

function ansiColorMapping(
  table: "colors.normal" | "colors.bright",
  key: string,
  ansiName: AnsiColorName,
): AlacrittyMapping {
  return colorMapping(
    table,
    key,
    `colors.ansi.${ansiName}`,
    (shared) => shared.colors.ansi[ansiName] ?? null,
    (shared, value) => {
      shared.colors.ansi[ansiName] = value;
    },
  );
}

const mappingList: AlacrittyMapping[] = [
  fontFamilyMapping(
    "font.normal",
    "font.family",
    (shared) => shared.font.family,
    (shared, value) => {
      shared.font.family = value;
    },
  ),
  fontFamilyMapping(
    "font.bold",
    "font.boldFamily",
    (shared) => shared.font.boldFamily,
    (shared, value) => {
      shared.font.boldFamily = value;
    },
  ),
  fontFamilyMapping(
    "font.italic",
    "font.italicFamily",
    (shared) => shared.font.italicFamily,
    (shared, value) => {
      shared.font.italicFamily = value;
    },
  ),
  fontFamilyMapping(
    "font.bold_italic",
    "font.boldItalicFamily",
    (shared) => shared.font.boldItalicFamily,
    (shared, value) => {
      shared.font.boldItalicFamily = value;
    },
  ),
  defineMapping({
    table: "font",
    key: "size",
    modelPath: "font.size",
    parse: parseFontSize,
    read: (shared) => shared.font.size,
    write: (shared, value) => {
      shared.font.size = value;
    },
    serialize: serializeNumber,
  }),
  colorMapping(
    "colors.primary",
    "foreground",
    "colors.foreground",
    (shared) => shared.colors.foreground,
    (shared, value) => {
      shared.colors.foreground = value;
    },
  ),
  colorMapping(
    "colors.primary",
    "background",
    "colors.background",
    (shared) => shared.colors.background,
    (shared, value) => {
      shared.colors.background = value;
    },
  ),
  colorMapping(
    "colors.cursor",
    "cursor",
    "colors.cursor",
    (shared) => shared.colors.cursor,
    (shared, value) => {
      shared.colors.cursor = value;
    },
  ),
  colorMapping(
    "colors.cursor",
    "text",
    "colors.cursorText",
    (shared) => shared.colors.cursorText,
    (shared, value) => {
      shared.colors.cursorText = value;
    },
  ),
  colorMapping(
    "colors.selection",
    "background",
    "colors.selectionBackground",
    (shared) => shared.colors.selectionBackground,
    (shared, value) => {
      shared.colors.selectionBackground = value;
    },
  ),
  colorMapping(
    "colors.selection",
    "text",
    "colors.selectionForeground",
    (shared) => shared.colors.selectionForeground,
    (shared, value) => {
      shared.colors.selectionForeground = value;
    },
  ),
  ansiColorMapping("colors.normal", "black", "black"),
  ansiColorMapping("colors.normal", "red", "red"),
  ansiColorMapping("colors.normal", "green", "green"),
  ansiColorMapping("colors.normal", "yellow", "yellow"),
  ansiColorMapping("colors.normal", "blue", "blue"),
  ansiColorMapping("colors.normal", "magenta", "magenta"),
  ansiColorMapping("colors.normal", "cyan", "cyan"),
  ansiColorMapping("colors.normal", "white", "white"),
  ansiColorMapping("colors.bright", "black", "brightBlack"),
  ansiColorMapping("colors.bright", "red", "brightRed"),
  ansiColorMapping("colors.bright", "green", "brightGreen"),
  ansiColorMapping("colors.bright", "yellow", "brightYellow"),
  ansiColorMapping("colors.bright", "blue", "brightBlue"),
  ansiColorMapping("colors.bright", "magenta", "brightMagenta"),
  ansiColorMapping("colors.bright", "cyan", "brightCyan"),
  ansiColorMapping("colors.bright", "white", "brightWhite"),
  defineMapping({
    table: "window",
    key: "opacity",
    modelPath: "window.opacity",
    parse: parseOpacity,
    read: (shared) => shared.window.opacity,
    write: (shared, value) => {
      shared.window.opacity = value;
    },
    serialize: serializeNumber,
  }),
  defineMapping({
    table: "window",
    key: "padding",
    modelPath: "window.padding",
    parse: parsePadding,
    read: (shared) => {
      if (shared.window.paddingX === null && shared.window.paddingY === null) {
        return null;
      }
      return {
        x: shared.window.paddingX ?? 0,
        y: shared.window.paddingY ?? 0,
      };
    },
    write: (shared, value) => {
      shared.window.paddingX = value.x;
      shared.window.paddingY = value.y;
    },
    serialize: serializePadding,
    equals: (left, right) => left.x === right.x && left.y === right.y,
  }),
  defineMapping({
    table: "window",
    key: "decorations",
    modelPath: "window.decorations",
    parse: parseDecorations,
    read: (shared) =>
      shared.window.decorations === "system" ||
      shared.window.decorations === "none"
        ? shared.window.decorations
        : null,
    write: (shared, value) => {
      shared.window.decorations = value;
    },
    serialize: serializeDecorations,
  }),
  defineMapping({
    table: "cursor.style",
    key: "shape",
    modelPath: "cursor.shape",
    parse: parseCursorShape,
    read: (shared) => shared.cursor.shape,
    write: (shared, value) => {
      shared.cursor.shape = value;
    },
    serialize: serializeCursorShape,
  }),
  defineMapping({
    table: "cursor.style",
    key: "blinking",
    modelPath: "cursor.blink",
    parse: parseCursorBlink,
    read: (shared) => shared.cursor.blink,
    write: (shared, value) => {
      shared.cursor.blink = value;
    },
    serialize: serializeCursorBlink,
  }),
  defineMapping({
    table: "scrolling",
    key: "history",
    modelPath: "behavior.scrollbackLines",
    parse: parseScrollback,
    read: (shared) => shared.behavior.scrollbackLines,
    write: (shared, value) => {
      shared.behavior.scrollbackLines = value;
    },
    serialize: serializeNumber,
  }),
  defineMapping({
    table: "selection",
    key: "save_to_clipboard",
    modelPath: "behavior.copyOnSelect",
    parse: parseBoolean,
    read: (shared) => shared.behavior.copyOnSelect,
    write: (shared, value) => {
      shared.behavior.copyOnSelect = value;
    },
    serialize: serializeBoolean,
  }),
  defineMapping({
    table: "bell",
    key: "duration",
    modelPath: "behavior.visualBell",
    parse: parseBellDuration,
    read: (shared) => shared.behavior.visualBell,
    write: (shared, value) => {
      shared.behavior.visualBell = value;
    },
    serialize: serializeBellDuration,
  }),
];

export const alacrittyMappings = Object.fromEntries(
  mappingList.map((mapping) => [mapping.settingPath, mapping]),
) as Readonly<Record<string, AlacrittyMapping>>;

export function getAlacrittyMapping(
  settingPath: string,
): AlacrittyMapping | undefined {
  return alacrittyMappings[settingPath];
}

export function isAlacrittySettingPath(settingPath: string): boolean {
  return getAlacrittyMapping(settingPath) !== undefined;
}

export function isKnownAlacrittyTable(table: string): boolean {
  return mappingList.some((mapping) => mapping.table === table);
}

export function allAlacrittyMappings(): readonly AlacrittyMapping[] {
  return mappingList;
}
