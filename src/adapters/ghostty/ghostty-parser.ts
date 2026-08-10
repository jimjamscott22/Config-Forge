import type { DocumentNode } from "../../domain/document-node";
import type { SharedConfig } from "../../domain/shared-config";
import type { ValidationIssue } from "../../domain/validation";
import type { ParseResult } from "../terminal-adapter";
import type { GhosttyOverrides } from "./ghostty-adapter";
import { ghosttyMappings, isGhosttySettingKey } from "./ghostty-mappings";

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
    id: `ghostty:${lineNumber}:${stableTextHash(line)}`,
    originalText: line,
    originalLine: lineNumber,
    modified: false,
  };
}

export function parseGhosttyLine(
  line: string,
  lineNumber: number,
): DocumentNode {
  const base = nodeBase(line, lineNumber);
  const trimmed = line.trim();

  if (trimmed === "") {
    return { ...base, kind: "blank" };
  }
  if (trimmed.startsWith("#")) {
    return { ...base, kind: "comment" };
  }

  const assignment = /^\s*([A-Za-z0-9][A-Za-z0-9-]*)\s*=\s*(.*?)\s*$/.exec(
    line,
  );
  if (!assignment?.[1] || assignment[2] === undefined) {
    return {
      ...base,
      kind: "malformed",
      reason: "Missing or invalid key-value separator",
    };
  }

  const key = assignment[1];
  const value = assignment[2];
  if (isGhosttySettingKey(key)) {
    return {
      ...base,
      kind: "known-setting",
      key,
      value,
      modelPath: ghosttyMappings[key].modelPath,
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
  overrides: GhosttyOverrides,
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

export function parseGhostty(source: string): ParseResult<GhosttyOverrides> {
  const shared = emptySharedConfig();
  const overrides: GhosttyOverrides = {};
  const unmappedNodeIds: string[] = [];
  const issues: ValidationIssue[] = [];
  const document = sourceLines(source).map((line, index) =>
    parseGhosttyLine(line, index + 1),
  );

  for (const node of document) {
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
        code: "GHOSTTY_MALFORMED_LINE",
        message: node.reason,
        sourceLine: node.originalLine,
      });
      continue;
    }

    if (node.kind !== "known-setting" || !isGhosttySettingKey(node.key)) {
      continue;
    }

    const applied = ghosttyMappings[node.key].apply(shared, node.value);
    if (!applied.ok) {
      appendOverride(overrides, node.key, node.value);
      unmappedNodeIds.push(node.id);
      issues.push({
        id: `${node.id}:unsupported-value`,
        severity: "warning",
        code: "GHOSTTY_UNSUPPORTED_VALUE",
        message: `${node.key}: ${applied.reason}`,
        modelPath: node.modelPath,
        sourceLine: node.originalLine,
      });
    }
  }

  return { shared, overrides, document, unmappedNodeIds, issues };
}
