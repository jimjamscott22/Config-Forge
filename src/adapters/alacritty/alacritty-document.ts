import * as TOML from "@iarna/toml";
import type { DocumentNode, NodeBase } from "../../domain/document-node";
import type { TerminalProject } from "../../domain/project";
import type { SharedConfig } from "../../domain/shared-config";
import type { ValidationIssue } from "../../domain/validation";
import type { GenerateResult, ParseResult } from "../terminal-adapter";
import type { AlacrittyOverrides } from "./alacritty-adapter";
import {
  allAlacrittyMappings,
  getAlacrittyMapping,
  isAlacrittySettingPath,
  isKnownAlacrittyTable,
  type AlacrittyMapping,
} from "./alacritty-mappings";

export interface TomlKnownSettingNode extends NodeBase {
  kind: "known-setting";
  key: string;
  value: string;
  modelPath: string;
  valueStart: number;
  valueEnd: number;
}

interface TomlSectionNode extends NodeBase {
  kind: "section";
  name: string;
  array: boolean;
}

interface LineChunk {
  text: string;
  content: string;
  start: number;
  lineNumber: number;
}

interface AssignmentSpan {
  key: string;
  value: string;
  valueStart: number;
  valueEnd: number;
}

interface SourceEdit {
  start: number;
  end: number;
  text: string;
}

interface NodePosition {
  node: DocumentNode;
  start: number;
  end: number;
}

function stableTextHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function nodeBase(line: LineChunk): NodeBase {
  return {
    id: `alacritty:${line.lineNumber}:${stableTextHash(line.text)}`,
    originalText: line.text,
    originalLine: line.lineNumber,
    modified: false,
  };
}

function splitPhysicalLines(source: string): LineChunk[] {
  const chunks = source.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  let offset = 0;
  const result: LineChunk[] = [];

  for (const text of chunks) {
    if (text === "") {
      continue;
    }
    const content = text.replace(/(?:\r\n|\n|\r)$/, "");
    result.push({
      text,
      content,
      start: offset,
      lineNumber: result.length + 1,
    });
    offset += text.length;
  }
  return result;
}

function findSeparator(line: string): number {
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (quote === "'") {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "=") {
      return index;
    }
  }
  return -1;
}

function findValueEnd(line: string, valueStart: number): number {
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let index = valueStart; index < line.length; index += 1) {
    const character = line[index];
    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (quote === "'") {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "#") {
      return index;
    }
  }
  return line.length;
}

function assignmentSpan(line: LineChunk): AssignmentSpan | null {
  const separator = findSeparator(line.content);
  if (separator < 0) {
    return null;
  }
  const key = line.content.slice(0, separator).trim();
  let valueStart = separator + 1;
  while (/\s/.test(line.content[valueStart] ?? "")) {
    valueStart += 1;
  }
  let valueEnd = findValueEnd(line.content, valueStart);
  while (valueEnd > valueStart && /\s/.test(line.content[valueEnd - 1] ?? "")) {
    valueEnd -= 1;
  }
  if (key === "" || valueStart === valueEnd) {
    return null;
  }
  return {
    key,
    value: line.content.slice(valueStart, valueEnd),
    valueStart: line.start + valueStart,
    valueEnd: line.start + valueEnd,
  };
}

function parseTomlLiteral(value: string): unknown {
  return TOML.parse(`value = ${value}\n`).value;
}

function isCompleteTomlLiteral(value: string): boolean {
  try {
    parseTomlLiteral(value);
    return true;
  } catch {
    return false;
  }
}

function simpleDottedPath(value: string): string | null {
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(normalized)
    ? normalized
    : null;
}

function qualifySettingPath(currentTable: string, key: string): string {
  const simpleKey = simpleDottedPath(key);
  if (simpleKey === null) {
    return currentTable === "" ? key : `${currentTable}.${key}`;
  }
  return currentTable === "" ? simpleKey : `${currentTable}.${simpleKey}`;
}

export function scanAlacrittyDocument(source: string): DocumentNode[] {
  let currentTable = "";
  return splitPhysicalLines(source).map((line): DocumentNode => {
    const base = nodeBase(line);
    const trimmed = line.content.trim();
    if (trimmed === "") {
      return { ...base, kind: "blank" };
    }
    if (trimmed.startsWith("#")) {
      return { ...base, kind: "comment" };
    }

    const arrayTable = /^\s*\[\[([^\]]+)\]\]\s*(?:#.*)?$/.exec(line.content);
    if (arrayTable?.[1]) {
      currentTable = simpleDottedPath(arrayTable[1]) ?? arrayTable[1].trim();
      const sectionNode: TomlSectionNode = {
        ...base,
        kind: "section",
        name: currentTable,
        array: true,
      };
      return sectionNode;
    }
    const table = /^\s*\[(.+)\]\s*(?:#.*)?$/.exec(line.content);
    if (table?.[1]) {
      currentTable = simpleDottedPath(table[1]) ?? table[1].trim();
      const sectionNode: TomlSectionNode = {
        ...base,
        kind: "section",
        name: currentTable,
        array: false,
      };
      return sectionNode;
    }

    const assignment = assignmentSpan(line);
    if (assignment === null) {
      return {
        ...base,
        kind: "malformed",
        reason: "Line is not a supported TOML table or assignment",
      };
    }
    const settingPath = qualifySettingPath(currentTable, assignment.key);
    const mapping = getAlacrittyMapping(settingPath);
    if (mapping && isCompleteTomlLiteral(assignment.value)) {
      const knownNode: TomlKnownSettingNode = {
        ...base,
        kind: "known-setting",
        key: settingPath,
        value: assignment.value,
        modelPath: mapping.modelPath,
        valueStart: assignment.valueStart,
        valueEnd: assignment.valueEnd,
      };
      return knownNode;
    }
    return {
      ...base,
      kind: "unknown-setting",
      key: settingPath,
      value: assignment.value,
    };
  });
}

export function isTomlKnownSettingNode(
  node: DocumentNode,
): node is DocumentNode & TomlKnownSettingNode {
  return (
    node.kind === "known-setting" &&
    "valueStart" in node &&
    typeof node.valueStart === "number" &&
    "valueEnd" in node &&
    typeof node.valueEnd === "number"
  );
}

function isTomlSectionNode(
  node: DocumentNode,
): node is DocumentNode & TomlSectionNode {
  return node.kind === "section" && "array" in node;
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
  overrides: AlacrittyOverrides,
  key: string,
  value: string,
): void {
  (overrides[key] ??= []).push(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedValue(root: unknown, path: string): unknown {
  let value = root;
  for (const segment of path.split(".")) {
    if (!isRecord(value) || !Object.hasOwn(value, segment)) {
      return undefined;
    }
    value = value[segment];
  }
  return value;
}

function invalidTomlIssue(error: unknown): ValidationIssue {
  return {
    id: "alacritty:invalid-toml",
    severity: "error",
    code: "ALACRITTY_INVALID_TOML",
    message: error instanceof Error ? error.message : "Invalid TOML document",
  };
}

export function parseAlacrittyDocument(
  source: string,
): ParseResult<AlacrittyOverrides> {
  const document = scanAlacrittyDocument(source);
  const shared = emptySharedConfig();
  const overrides: AlacrittyOverrides = {};
  const unmappedNodeIds: string[] = [];
  const issues: ValidationIssue[] = [];

  let parsedDocument: unknown;
  try {
    parsedDocument = TOML.parse(source);
  } catch (error) {
    return {
      shared,
      overrides,
      document,
      unmappedNodeIds: document.map((node) => node.id),
      issues: [invalidTomlIssue(error)],
    };
  }

  for (const node of document) {
    if (node.kind === "section") {
      if (!isKnownAlacrittyTable(node.name)) {
        unmappedNodeIds.push(node.id);
      }
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
        code: "ALACRITTY_UNMODELED_TOML",
        message: node.reason,
        sourceLine: node.originalLine,
      });
      continue;
    }
    if (!isTomlKnownSettingNode(node)) {
      continue;
    }
    const mapping = getAlacrittyMapping(node.key);
    if (!mapping) {
      continue;
    }
    const result = mapping.apply(shared, nestedValue(parsedDocument, node.key));
    if (!result.ok) {
      appendOverride(overrides, node.key, node.value);
      unmappedNodeIds.push(node.id);
      issues.push({
        id: `${node.id}:unsupported-value`,
        severity: "warning",
        code: "ALACRITTY_UNSUPPORTED_VALUE",
        message: `${node.key}: ${result.reason}`,
        modelPath: node.modelPath,
        sourceLine: node.originalLine,
      });
    }
  }

  return { shared, overrides, document, unmappedNodeIds, issues };
}

function documentSource(document: DocumentNode[]): string {
  return document.map((node) => node.originalText).join("");
}

function positionedNodes(document: DocumentNode[]): NodePosition[] {
  let offset = 0;
  return document.map((node) => {
    const position = {
      node,
      start: offset,
      end: offset + node.originalText.length,
    };
    offset = position.end;
    return position;
  });
}

function parseNodeNativeValue(node: TomlKnownSettingNode): unknown {
  try {
    return parseTomlLiteral(node.value);
  } catch {
    return undefined;
  }
}

function insertText(
  insertions: Map<number, string>,
  offset: number,
  text: string,
): void {
  insertions.set(offset, `${insertions.get(offset) ?? ""}${text}`);
}

function prefixForLineInsertion(source: string, offset: number): string {
  return offset > 0 && !/[\r\n]/.test(source[offset - 1] ?? "") ? "\n" : "";
}

function prefixForNewTableBlock(source: string): string {
  if (source === "" || source.endsWith("\n\n") || source.endsWith("\r\n\r\n")) {
    return "";
  }
  return /[\r\n]$/.test(source) ? "\n" : "\n\n";
}

function missingMappingsByTable(
  project: TerminalProject,
  presentPaths: Set<string>,
): Map<string, Array<{ mapping: AlacrittyMapping; value: string }>> {
  const result = new Map<
    string,
    Array<{ mapping: AlacrittyMapping; value: string }>
  >();
  for (const mapping of allAlacrittyMappings()) {
    if (presentPaths.has(mapping.settingPath)) {
      continue;
    }
    const value = mapping.serialize(project.shared);
    if (value === null) {
      continue;
    }
    const entries = result.get(mapping.table) ?? [];
    entries.push({ mapping, value });
    result.set(mapping.table, entries);
  }
  return result;
}

function applyEdits(source: string, edits: SourceEdit[]): string {
  let result = source;
  for (const edit of edits.sort(
    (left, right) => right.start - left.start || right.end - left.end,
  )) {
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
  }
  return result;
}

export function writeAlacrittyDocument(
  project: TerminalProject,
): GenerateResult {
  const source = documentSource(project.document);
  const positions = positionedNodes(project.document);
  const unmappedNodeIds = new Set(project.unmappedNodeIds);
  const changedNodeIds: string[] = [];
  const edits: SourceEdit[] = [];
  const knownNodes = project.document.filter(isTomlKnownSettingNode);
  const presentPaths = new Set(knownNodes.map((node) => node.key));
  const effectiveNodes = new Map<string, TomlKnownSettingNode>();

  for (const node of knownNodes) {
    effectiveNodes.set(node.key, node);
  }
  for (const node of knownNodes) {
    if (unmappedNodeIds.has(node.id) || effectiveNodes.get(node.key) !== node) {
      continue;
    }
    const mapping = getAlacrittyMapping(node.key);
    if (!mapping) {
      continue;
    }
    const serialized = mapping.serialize(project.shared);
    if (serialized === null) {
      const position = positions.find((candidate) => candidate.node === node);
      if (position) {
        edits.push({ start: position.start, end: position.end, text: "" });
        changedNodeIds.push(node.id);
      }
      continue;
    }
    if (mapping.matches(project.shared, parseNodeNativeValue(node))) {
      continue;
    }
    edits.push({
      start: node.valueStart,
      end: node.valueEnd,
      text: serialized,
    });
    changedNodeIds.push(node.id);
  }

  const missingByTable = missingMappingsByTable(project, presentPaths);
  const insertions = new Map<number, string>();
  const sectionPositions = positions.filter(
    (
      position,
    ): position is NodePosition & { node: DocumentNode & TomlSectionNode } =>
      isTomlSectionNode(position.node) && !position.node.array,
  );
  const newTables = new Map(missingByTable);

  for (const section of sectionPositions) {
    const entries = missingByTable.get(section.node.name);
    if (!entries) {
      continue;
    }
    const nextSection = sectionPositions.find(
      (candidate) => candidate.start > section.start,
    );
    const offset = nextSection?.start ?? source.length;
    const assignments = entries
      .map(({ mapping, value }) => `${mapping.key} = ${value}`)
      .join("\n");
    insertText(
      insertions,
      offset,
      `${prefixForLineInsertion(source, offset)}${assignments}\n`,
    );
    newTables.delete(section.node.name);
  }

  if (newTables.size > 0) {
    const existingAtEnd = insertions.get(source.length) ?? "";
    const virtualSource = `${source}${existingAtEnd}`;
    const blocks = Array.from(newTables.entries()).map(([table, entries]) => {
      const assignments = entries
        .map(({ mapping, value }) => `${mapping.key} = ${value}`)
        .join("\n");
      return `[${table}]\n${assignments}`;
    });
    const block = `${prefixForNewTableBlock(virtualSource)}# Added by Config Forge\n${blocks.join("\n\n")}\n`;
    insertText(insertions, source.length, block);
  }

  for (const [offset, text] of insertions) {
    edits.push({ start: offset, end: offset, text });
  }

  return {
    source: applyEdits(source, edits),
    changedNodeIds,
    issues: [],
  };
}

export function isMappedAlacrittyNode(node: DocumentNode): boolean {
  return isTomlKnownSettingNode(node) && isAlacrittySettingPath(node.key);
}
