import { sharedConfigSchema } from "../../domain/shared-config";
import type { ValidationIssue } from "../../domain/validation";
import type { TerminalAdapter } from "../terminal-adapter";
import { kittyMappings } from "./kitty-mappings";
import { parseKitty } from "./kitty-parser";
import { writeKitty } from "./kitty-writer";

const supportedSharedPaths = Object.values(kittyMappings).map(
  (mapping) => mapping.modelPath,
);

export type KittyOverrides = Record<string, string[]>;

function schemaIssues(projectShared: unknown): ValidationIssue[] {
  const result = sharedConfigSchema.safeParse(projectShared);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue, index) => ({
    id: `kitty:shared:${index}`,
    severity: "error",
    code: "KITTY_INVALID_SHARED_VALUE",
    message: issue.message,
    modelPath: issue.path.join("."),
  }));
}

export const kittyAdapter: TerminalAdapter<KittyOverrides> = {
  terminal: "kitty",
  parse: parseKitty,
  generate(project) {
    if (project.terminal !== "kitty") {
      return {
        source: "",
        changedNodeIds: [],
        issues: [
          {
            id: "kitty:wrong-terminal",
            severity: "error",
            code: "KITTY_WRONG_TERMINAL",
            message: `Cannot generate Kitty configuration for ${project.terminal}`,
          },
        ],
      };
    }
    return writeKitty(project);
  },
  validateInternal(project) {
    const issues = schemaIssues(project.shared);
    const seenPaths = new Map<string, number>();

    if (project.terminal !== "kitty") {
      issues.push({
        id: "kitty:wrong-terminal",
        severity: "error",
        code: "KITTY_WRONG_TERMINAL",
        message: `Cannot validate Kitty configuration for ${project.terminal}`,
      });
    }

    for (const node of project.document) {
      if (node.kind === "malformed") {
        issues.push({
          id: `${node.id}:malformed`,
          severity: "warning",
          code: "KITTY_MALFORMED_LINE",
          message: node.reason,
          sourceLine: node.originalLine,
        });
      } else if (node.kind === "known-setting") {
        const previousLine = seenPaths.get(node.modelPath);
        if (previousLine !== undefined) {
          issues.push({
            id: `${node.id}:duplicate`,
            severity: "warning",
            code: "KITTY_DUPLICATE_SETTING",
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
