import { sharedConfigSchema } from "../../domain/shared-config";
import type { ValidationIssue } from "../../domain/validation";
import type { TerminalAdapter } from "../terminal-adapter";
import { ghosttyMappings } from "./ghostty-mappings";
import { parseGhostty } from "./ghostty-parser";
import { writeGhostty } from "./ghostty-writer";

const supportedSharedPaths = Object.values(ghosttyMappings).map(
  (mapping) => mapping.modelPath,
);

export type GhosttyOverrides = Record<string, string[]>;

function schemaIssues(projectShared: unknown): ValidationIssue[] {
  const result = sharedConfigSchema.safeParse(projectShared);
  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue, index) => ({
    id: `ghostty:shared:${index}`,
    severity: "error",
    code: "GHOSTTY_INVALID_SHARED_VALUE",
    message: issue.message,
    modelPath: issue.path.join("."),
  }));
}

export const ghosttyAdapter: TerminalAdapter<GhosttyOverrides> = {
  terminal: "ghostty",
  parse: parseGhostty,
  generate(project) {
    if (project.terminal !== "ghostty") {
      return {
        source: "",
        changedNodeIds: [],
        issues: [
          {
            id: "ghostty:wrong-terminal",
            severity: "error",
            code: "GHOSTTY_WRONG_TERMINAL",
            message: `Cannot generate Ghostty configuration for ${project.terminal}`,
          },
        ],
      };
    }
    return writeGhostty(project);
  },
  validateInternal(project) {
    const issues = schemaIssues(project.shared);
    const seenPaths = new Map<string, number>();

    if (project.terminal !== "ghostty") {
      issues.push({
        id: "ghostty:wrong-terminal",
        severity: "error",
        code: "GHOSTTY_WRONG_TERMINAL",
        message: `Cannot validate Ghostty configuration for ${project.terminal}`,
      });
    }

    for (const node of project.document) {
      if (node.kind === "malformed") {
        issues.push({
          id: `${node.id}:malformed`,
          severity: "warning",
          code: "GHOSTTY_MALFORMED_LINE",
          message: node.reason,
          sourceLine: node.originalLine,
        });
      } else if (node.kind === "known-setting") {
        const previousLine = seenPaths.get(node.modelPath);
        if (previousLine !== undefined) {
          issues.push({
            id: `${node.id}:duplicate`,
            severity: "warning",
            code: "GHOSTTY_DUPLICATE_SETTING",
            message: `${node.key} overrides the value from line ${previousLine}`,
            modelPath: node.modelPath,
            sourceLine: node.originalLine,
          });
        }
        seenPaths.set(node.modelPath, node.originalLine);
      }
    }

    return {
      valid: !issues.some((issue) => issue.severity === "error"),
      nativeAvailable: false,
      issues,
    };
  },
  extractPortable(project) {
    return {
      shared: project.shared,
      omitted: Object.keys(project.overrides).map((key) => ({
        key,
        reason: "terminal-specific" as const,
      })),
    };
  },
  createOverrides: () => ({}),
  supportedSharedPaths: () => supportedSharedPaths,
};
