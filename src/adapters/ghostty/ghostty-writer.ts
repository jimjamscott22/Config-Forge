import type { DocumentNode } from "../../domain/document-node";
import type { TerminalProject } from "../../domain/project";
import type { GenerateResult } from "../terminal-adapter";
import {
  ghosttyMappings,
  isGhosttySettingKey,
  type GhosttySettingKey,
} from "./ghostty-mappings";

function knownNodesByPath(
  document: DocumentNode[],
): Map<string, DocumentNode[]> {
  const result = new Map<string, DocumentNode[]>();
  for (const node of document) {
    if (node.kind !== "known-setting") {
      continue;
    }
    const nodes = result.get(node.modelPath) ?? [];
    nodes.push(node);
    result.set(node.modelPath, nodes);
  }
  return result;
}

function finishWithOneNewline(lines: string[]): string {
  while (lines.at(-1)?.trim() === "") {
    lines.pop();
  }
  return `${lines.join("\n")}\n`;
}

export function writeGhostty(project: TerminalProject): GenerateResult {
  const lines: string[] = [];
  const changedNodeIds: string[] = [];
  const unmappedNodeIds = new Set(project.unmappedNodeIds);
  const portableDocument = project.document.filter(
    (node) => !unmappedNodeIds.has(node.id),
  );
  const nodesByPath = knownNodesByPath(portableDocument);

  for (const node of project.document) {
    if (node.kind !== "known-setting" || !isGhosttySettingKey(node.key)) {
      lines.push(node.originalText);
      continue;
    }
    if (unmappedNodeIds.has(node.id)) {
      lines.push(node.originalText);
      continue;
    }

    const mapping = ghosttyMappings[node.key];
    const serialized = mapping.serialize(project.shared, node.value);
    const nodesForPath = nodesByPath.get(node.modelPath) ?? [];
    const effectiveNode = nodesForPath.at(-1);

    if (serialized === null) {
      changedNodeIds.push(node.id);
      continue;
    }

    if (
      node.id !== effectiveNode?.id ||
      mapping.matches(project.shared, node.value)
    ) {
      lines.push(node.originalText);
      continue;
    }

    lines.push(`${node.key} = ${serialized}`);
    changedNodeIds.push(node.id);
  }

  const missingSettings: Array<[GhosttySettingKey, string]> = [];
  for (const key of Object.keys(ghosttyMappings) as GhosttySettingKey[]) {
    const mapping = ghosttyMappings[key];
    if (nodesByPath.has(mapping.modelPath)) {
      continue;
    }
    const serialized = mapping.serialize(project.shared);
    if (serialized !== null) {
      missingSettings.push([key, serialized]);
    }
  }

  if (missingSettings.length > 0) {
    if (lines.length > 0 && lines.at(-1)?.trim() !== "") {
      lines.push("");
    }
    lines.push("# Added by Config Forge");
    for (const [key, value] of missingSettings) {
      lines.push(`${key} = ${value}`);
    }
  }

  return {
    source: finishWithOneNewline(lines),
    changedNodeIds,
    issues: [],
  };
}
