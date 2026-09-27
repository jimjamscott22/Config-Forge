import { describe, expect, test } from "vitest";
import "../adapters/registry";
import type { TerminalProject } from "../domain/project";
import { sharedConfigSchema } from "../domain/shared-config";
import type { TranslationReport } from "../domain/translation";
import { makeSharedConfig } from "../test/fixtures/shared-config";
import { validateProject } from "./validation-service";

function makeValidProject(): TerminalProject {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Daily Ghostty",
    terminal: "ghostty",
    shared: sharedConfigSchema.parse(makeSharedConfig()),
    overrides: {},
    document: [],
    unmappedNodeIds: [],
    sourcePath: "/home/user/.config/ghostty/config",
    destinationPath: null,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  };
}

describe("validateProject", () => {
  test("blocks a project with an out-of-range opacity", () => {
    const project = makeValidProject();
    project.shared.window.opacity = 1.5;

    const result = validateProject(project);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "INVALID_OPACITY",
        }),
      ]),
    );
  });

  test("warns about malformed preserved nodes", () => {
    const project = makeValidProject();
    project.document.push({
      id: "bad-line",
      kind: "malformed",
      originalText: "font-size ???",
      originalLine: 9,
      modified: false,
      reason: "Missing key-value separator",
    });

    const result = validateProject(project);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          sourceLine: 9,
        }),
      ]),
    );
  });

  test("passes a project with no issues", () => {
    const project = makeValidProject();

    const result = validateProject(project);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test("warns when the target path does not exist yet", () => {
    const project = makeValidProject();

    const result = validateProject(project, {
      targetPath: { exists: false, writable: false },
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "TARGET_PATH_MISSING",
        }),
      ]),
    );
  });

  test("blocks applying to a read-only target path", () => {
    const project = makeValidProject();

    const result = validateProject(project, {
      targetPath: { exists: true, writable: false },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "TARGET_PATH_READ_ONLY",
        }),
      ]),
    );
  });

  test("surfaces omitted and defaulted translation fields as info", () => {
    const project = makeValidProject();
    const translationReport: TranslationReport = {
      sourceTerminal: "kitty",
      destinationTerminal: "ghostty",
      items: [
        {
          modelPath: "font.boldFamily",
          status: "omitted",
          sourceValue: "JetBrains Mono",
          destinationValue: null,
          explanation: "ghostty has no equivalent setting for font.boldFamily.",
        },
        {
          modelPath: "behavior.attentionOnBell",
          status: "defaulted",
          sourceValue: undefined,
          destinationValue: null,
          explanation:
            "kitty has no equivalent setting for behavior.attentionOnBell.",
        },
      ],
    };

    const result = validateProject(project, { translationReport });

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "TRANSLATION_OMITTED_FIELD" }),
        expect.objectContaining({ code: "TRANSLATION_DEFAULTED_FIELD" }),
      ]),
    );
  });

  test("sorts issues by severity, then source line, then message", () => {
    const project = makeValidProject();
    project.shared.window.opacity = 1.5;
    project.document.push({
      id: "bad-line",
      kind: "malformed",
      originalText: "font-size ???",
      originalLine: 9,
      modified: false,
      reason: "Missing key-value separator",
    });

    const result = validateProject(project, {
      targetPath: { exists: false, writable: false },
    });

    const severities = result.issues.map((issue) => issue.severity);
    const errorCount = severities.filter(
      (severity) => severity === "error",
    ).length;
    const warningCount = severities.filter(
      (severity) => severity === "warning",
    ).length;

    expect(severities.slice(0, errorCount)).toEqual(
      Array(errorCount).fill("error"),
    );
    expect(severities.slice(errorCount, errorCount + warningCount)).toEqual(
      Array(warningCount).fill("warning"),
    );
  });
});
