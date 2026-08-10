import type { DocumentNode } from "../../domain/document-node";
import type { SharedConfig } from "../../domain/shared-config";
import type { ValidationIssue } from "../../domain/validation";
import type { ParseResult } from "../terminal-adapter";
import type { KittyOverrides } from "./kitty-adapter";
import { isKittySettingKey, kittyMappings } from "./kitty-mappings";

function stableTextHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function nodeBase(line: string, lineNumber: number) {
  return {
    id: `kitty:${lineNumber}:${stableTextHash(line)}`,
    originalText: line,
    originalLine: lineNumber,
    modified: false,
  };
}

export function parseKittyLine(line: string, lineNumber: number): DocumentNode {
  const base = nodeBase(line, lineNumber);
  const trimmed = line.trim();

  if (trimmed === "") {
    return { ...base, kind: "blank" };
  }
  if (line.startsWith("#")) {
    return { ...base, kind: "comment" };
  }
  if (trimmed.endsWith("\\")) {
    return {
      ...base,
      kind: "malformed",
      reason: "Continued directives are preserved but not modeled",
    };
  }

  const directive = /^\s*([A-Za-z0-9_][A-Za-z0-9_-]*)[ \t]+(.*?)\s*$/.exec(
    line,
  );
  if (!directive?.[1] || directive[2] === undefined) {
    return {
      ...base,
      kind: "malformed",
      reason: "Missing or invalid directive value separator",
    };
  }

  const key = directive[1];
  const value = directive[2];
  if (key === "include" && value !== "") {
    return { ...base, kind: "include", target: value };
  }
  if (isKittySettingKey(key)) {
    return {
      ...base,
      kind: "known-setting",
      key,
      value,
      modelPath: kittyMappings[key].modelPath,
    };
  }
  return { ...base, kind: "unknown-setting", key, value };
}

function emptySharedConfig(): SharedConfig {
  return {
    font: {
      family: null,
      boldFamily: null,
      italicFamily: null,
      boldItalicFamily: null,
      size: null,
    },
    colors: {
      foreground: null,
      background: null,
      cursor: null,
      cursorText: null,
      selectionBackground: null,
      selectionForeground: null,
      ansi: {},
    },
    window: {
      opacity: null,
      paddingX: null,
      paddingY: null,
      decorations: null,
    },
    cursor: { shape: null, blink: null },
    behavior: {
      scrollbackLines: null,
      visualBell: null,
      attentionOnBell: null,
      copyOnSelect: null,
      middleClickPaste: null,
      confirmClose: null,
    },
  };
}

function appendOverride(
  overrides: KittyOverrides,
  key: string,
  value: string,
): void {
  (overrides[key] ??= []).push(value);
}

function sourceLines(source: string): string[] {
  const lines = source.split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

export function parseKitty(source: string): ParseResult<KittyOverrides> {
  const shared = emptySharedConfig();
  const overrides: KittyOverrides = {};
  const unmappedNodeIds: string[] = [];
  const issues: ValidationIssue[] = [];
  const document = sourceLines(source).map((line, index) =>
    parseKittyLine(line, index + 1),
  );

  for (const node of document) {
    if (node.kind === "include") {
      appendOverride(overrides, "include", node.target);
      unmappedNodeIds.push(node.id);
      continue;
    }
    if (node.kind === "unknown-setting") {
      appendOverride(overrides, node.key, node.value);
      unmappedNodeIds.push(node.id);
      continue;
    }
    if (node.kind === "malformed") {
      unmappedNodeIds.push(node.id);
      issues.push({
        id: `${node.id}:malformed`,
        severity: "warning",
        code: "KITTY_MALFORMED_LINE",
        message: node.reason,
        sourceLine: node.originalLine,
      });
      continue;
    }
    if (node.kind !== "known-setting" || !isKittySettingKey(node.key)) {
      continue;
    }

    const result = kittyMappings[node.key].apply(shared, node.value);
    if (!result.ok) {
      appendOverride(overrides, node.key, node.value);
      unmappedNodeIds.push(node.id);
      issues.push({
        id: `${node.id}:unsupported-value`,
        severity: "warning",
        code: "KITTY_UNSUPPORTED_VALUE",
        message: `${node.key}: ${result.reason}`,
        modelPath: node.modelPath,
        sourceLine: node.originalLine,
      });
    }
  }

  return { shared, overrides, document, unmappedNodeIds, issues };
}
