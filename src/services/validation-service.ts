import { getAdapter } from "../adapters/registry";
import type { TerminalProject } from "../domain/project";
import { sharedConfigSchema, type SharedConfig } from "../domain/shared-config";
import type { TranslationReport } from "../domain/translation";
import type {
  ValidationIssue,
  ValidationResult,
  ValidationSeverity,
} from "../domain/validation";

export interface TargetPathStatus {
  exists: boolean;
  writable: boolean;
}

export interface ValidationContext {
  targetPath?: TargetPathStatus | null;
  translationReport?: TranslationReport;
}

function toScreamingSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

function schemaIssues(shared: SharedConfig): ValidationIssue[] {
  const result = sharedConfigSchema.safeParse(shared);
  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue, index) => {
    const lastSegment = issue.path.at(-1);
    const code =
      typeof lastSegment === "string"
        ? `INVALID_${toScreamingSnakeCase(lastSegment)}`
        : "INVALID_SHARED_VALUE";

    return {
      id: `schema:${index}`,
      severity: "error",
      code,
      message: issue.message,
      modelPath: issue.path.join("."),
    };
  });
}

function targetPathIssues(
  targetPath?: TargetPathStatus | null,
): ValidationIssue[] {
  if (!targetPath) {
    return [];
  }

  if (!targetPath.exists) {
    return [
      {
        id: "target-path:missing",
        severity: "warning",
        code: "TARGET_PATH_MISSING",
        message:
          "The destination file does not exist yet; applying will create it.",
      },
    ];
  }

  if (!targetPath.writable) {
    return [
      {
        id: "target-path:read-only",
        severity: "error",
        code: "TARGET_PATH_READ_ONLY",
        message: "The destination file is not writable.",
      },
    ];
  }

  return [];
}

function translationIssues(report?: TranslationReport): ValidationIssue[] {
  if (!report) {
    return [];
  }

  return report.items
    .filter((item) => item.status === "omitted" || item.status === "defaulted")
    .map((item, index) => ({
      id: `translation:${item.modelPath}:${index}`,
      severity: "info" as const,
      code:
        item.status === "omitted"
          ? "TRANSLATION_OMITTED_FIELD"
          : "TRANSLATION_DEFAULTED_FIELD",
      message: item.explanation,
      modelPath: item.modelPath,
    }));
}

const SEVERITY_ORDER: Record<ValidationSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function compareIssues(a: ValidationIssue, b: ValidationIssue): number {
  const severityDelta = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }

  const lineA = a.sourceLine ?? Number.POSITIVE_INFINITY;
  const lineB = b.sourceLine ?? Number.POSITIVE_INFINITY;
  if (lineA !== lineB) {
    return lineA - lineB;
  }

  return a.message.localeCompare(b.message);
}

export function validateProject(
  project: TerminalProject,
  context: ValidationContext = {},
): ValidationResult {
  const adapterResult = getAdapter(project.terminal).validateInternal(project);

  const issues = [
    ...schemaIssues(project.shared),
    ...adapterResult.issues,
    ...targetPathIssues(context.targetPath),
    ...translationIssues(context.translationReport),
  ].sort(compareIssues);

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    nativeAvailable: adapterResult.nativeAvailable,
    issues,
  };
}
