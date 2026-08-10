import { sharedConfigSchema } from "../../domain/shared-config";
import type { ValidationIssue } from "../../domain/validation";
import type { TerminalAdapter } from "../terminal-adapter";
import {
  parseAlacrittyDocument,
  writeAlacrittyDocument,
} from "./alacritty-document";

export type AlacrittyOverrides = Record<string, string[]>;

function schemaIssues(projectShared: unknown): ValidationIssue[] {
  const result = sharedConfigSchema.safeParse(projectShared);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue, index) => ({
    id: `alacritty:shared:${index}`,
    severity: "error",
    code: "ALACRITTY_INVALID_SHARED_VALUE",
    message: issue.message,
    modelPath: issue.path.join("."),
  }));
}

export const alacrittyAdapter: TerminalAdapter<AlacrittyOverrides> = {
  terminal: "alacritty",
  parse: parseAlacrittyDocument,
  generate(project) {
    if (project.terminal !== "alacritty") {
      return {
        source: "",
        changedNodeIds: [],
        issues: [
          {
            id: "alacritty:wrong-terminal",
            severity: "error",
            code: "ALACRITTY_WRONG_TERMINAL",
            message: `Cannot generate Alacritty configuration for ${project.terminal}`,
          },
        ],
      };
    }
    return writeAlacrittyDocument(project);
  },
  validateInternal(project) {
    const issues = schemaIssues(project.shared);
    const seenPaths = new Map<string, number>();

    if (project.terminal !== "alacritty") {
      issues.push({
        id: "alacritty:wrong-terminal",
        severity: "error",
        code: "ALACRITTY_WRONG_TERMINAL",
        message: `Cannot validate Alacritty configuration for ${project.terminal}`,
      });
    }

    for (const node of project.document) {
      if (node.kind === "malformed") {
        issues.push({
          id: `${node.id}:malformed`,
          severity: "warning",
          code: "ALACRITTY_UNMODELED_TOML",
          message: node.reason,
          sourceLine: node.originalLine,
        });
      } else if (node.kind === "known-setting") {
        const previousLine = seenPaths.get(node.modelPath);
        if (previousLine !== undefined) {
          issues.push({
            id: `${node.id}:duplicate`,
            severity: "warning",
            code: "ALACRITTY_DUPLICATE_SETTING",
            message: `${node.key} duplicates the value from line ${previousLine}`,
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
};
