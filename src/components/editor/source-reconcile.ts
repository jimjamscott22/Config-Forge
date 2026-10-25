import { diffLines } from "diff";
import { getAdapter } from "../../adapters/registry";
import type { DocumentNode } from "../../domain/document-node";
import {
  projectPayloadSchema,
  type TerminalProject,
} from "../../domain/project";
import type { ValidationIssue } from "../../domain/validation";

export interface SourceReconciliation {
  /** The project with the edit applied; the original project when `applicable` is false. */
  project: TerminalProject;
  /** Parser diagnostics for the edited text. */
  issues: ValidationIssue[];
  /** False when the edit has parse errors and must not replace the project. */
  applicable: boolean;
  /** Preserved-only nodes (unknown, malformed, include, unmapped) the edit introduces. */
  unmappedAdded: DocumentNode[];
  /** Preserved-only nodes from the current project that the edit no longer contains. */
  unmappedRemoved: DocumentNode[];
  requiresConfirmation: boolean;
}

export interface DiffLine {
  kind: "added" | "removed" | "unchanged";
  text: string;
}

export function isPreservedNode(
  node: DocumentNode,
  unmappedNodeIds: readonly string[],
): boolean {
  return (
    unmappedNodeIds.includes(node.id) ||
    node.kind === "unknown-setting" ||
    node.kind === "include" ||
    node.kind === "malformed"
  );
}

function preservedNodes(
  document: DocumentNode[],
  unmappedNodeIds: readonly string[],
) {
  return document.filter((node) => isPreservedNode(node, unmappedNodeIds));
}

/** Nodes in `after` with no counterpart (by trimmed text) in `before`. */
function unmatchedNodes(before: DocumentNode[], after: DocumentNode[]) {
  const available = new Map<string, number>();
  for (const node of before) {
    const text = node.originalText.trim();
    available.set(text, (available.get(text) ?? 0) + 1);
  }
  return after.filter((node) => {
    const text = node.originalText.trim();
    const count = available.get(text) ?? 0;
    if (count > 0) {
      available.set(text, count - 1);
      return false;
    }
    return true;
  });
}

export function reconcileSourceEdit(
  project: TerminalProject,
  editedSource: string,
): SourceReconciliation {
  const rejected = (issues: ValidationIssue[]): SourceReconciliation => ({
    project,
    issues,
    applicable: false,
    unmappedAdded: [],
    unmappedRemoved: [],
    requiresConfirmation: false,
  });
  try {
    const parsed = getAdapter(project.terminal).parse(editedSource);
    if (parsed.issues.some((issue) => issue.severity === "error"))
      return rejected(parsed.issues);
    const next = projectPayloadSchema.parse({
      ...project,
      shared: parsed.shared,
      overrides: parsed.overrides,
      document: parsed.document,
      unmappedNodeIds: parsed.unmappedNodeIds,
      updatedAt: new Date().toISOString(),
    });
    const before = preservedNodes(project.document, project.unmappedNodeIds);
    const after = preservedNodes(next.document, next.unmappedNodeIds);
    const unmappedAdded = unmatchedNodes(before, after);
    const unmappedRemoved = unmatchedNodes(after, before);
    return {
      project: next,
      issues: parsed.issues,
      applicable: true,
      unmappedAdded,
      unmappedRemoved,
      requiresConfirmation: unmappedAdded.length > 0,
    };
  } catch (error) {
    return rejected([
      {
        id: "source.parse-failed",
        severity: "error",
        code: "SOURCE_PARSE_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    ]);
  }
}

/** Line diff of two sources; `current` is null when the destination does not exist yet. */
export function diffSourceLines(
  current: string | null,
  candidate: string,
): DiffLine[] {
  return diffLines(current ?? "", candidate).flatMap((part) => {
    const lines = part.value.split("\n");
    if (lines.at(-1) === "") lines.pop();
    const kind = part.added ? "added" : part.removed ? "removed" : "unchanged";
    return lines.map((text) => ({ kind, text }) satisfies DiffLine);
  });
}
