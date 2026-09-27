import { describe, expect, test } from "vitest";
import "../adapters/registry";
import type { TerminalProject } from "../domain/project";
import { sharedConfigSchema, type TerminalId } from "../domain/shared-config";
import { makeSharedConfig } from "../test/fixtures/shared-config";
import { translateProject } from "./translation-service";

type SharedConfigPatch = Partial<{
  font: Partial<TerminalProject["shared"]["font"]>;
  colors: Partial<TerminalProject["shared"]["colors"]>;
  window: Partial<TerminalProject["shared"]["window"]>;
  cursor: Partial<TerminalProject["shared"]["cursor"]>;
  behavior: Partial<TerminalProject["shared"]["behavior"]>;
}>;

function makeProjectWith(
  terminal: TerminalId,
  patch: SharedConfigPatch,
): TerminalProject {
  const base = sharedConfigSchema.parse(makeSharedConfig());

  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Source Project",
    terminal,
    shared: {
      font: { ...base.font, ...patch.font },
      colors: { ...base.colors, ...patch.colors },
      window: { ...base.window, ...patch.window },
      cursor: { ...base.cursor, ...patch.cursor },
      behavior: { ...base.behavior, ...patch.behavior },
    },
    overrides: {},
    document: [],
    unmappedNodeIds: [],
    sourcePath: "/home/user/.config/source/config",
    destinationPath: null,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  };
}

const ALL_TERMINALS: TerminalId[] = ["ghostty", "kitty", "alacritty"];

describe("translateProject", () => {
  test("translates portable Ghostty values into a new Kitty project", () => {
    const source = makeProjectWith("ghostty", {
      font: { family: "JetBrains Mono", size: 13 },
      window: { opacity: 0.92 },
      behavior: { middleClickPaste: true },
    });

    const result = translateProject(source, "kitty", "Kitty Copy");

    expect(result.project.id).not.toBe(source.id);
    expect(result.project.terminal).toBe("kitty");
    expect(result.project.shared.font.family).toBe("JetBrains Mono");
    expect(result.project.shared.window.opacity).toBe(0.92);
    expect(result.report.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelPath: "font.family",
          status: "exact",
        }),
      ]),
    );
  });

  test("creates a new id and clears source/destination paths", () => {
    const source = makeProjectWith("ghostty", {
      font: { family: "JetBrains Mono" },
    });

    const result = translateProject(source, "alacritty", "Alacritty Copy");

    expect(result.project.id).not.toBe(source.id);
    expect(result.project.sourcePath).toBeNull();
    expect(result.project.destinationPath).toBeNull();
    expect(result.project.name).toBe("Alacritty Copy");
  });

  test("leaves the source project object unchanged", () => {
    const source = makeProjectWith("ghostty", {
      font: { family: "JetBrains Mono" },
    });
    const sourceSnapshot = structuredClone(source);

    translateProject(source, "kitty", "Kitty Copy");

    expect(source).toEqual(sourceSnapshot);
  });

  test("records a field the destination cannot represent as omitted", () => {
    const source = makeProjectWith("ghostty", {
      behavior: { attentionOnBell: true },
    });

    const result = translateProject(source, "kitty", "Kitty Copy");

    expect(result.report.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelPath: "behavior.attentionOnBell",
          status: "omitted",
          sourceValue: true,
        }),
      ]),
    );
  });

  test("records a destination-only field as defaulted", () => {
    const source = makeProjectWith("ghostty", {
      font: { family: "JetBrains Mono" },
    });

    const result = translateProject(source, "kitty", "Kitty Copy");

    expect(result.report.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelPath: "font.boldFamily",
          status: "defaulted",
        }),
      ]),
    );
  });

  test("translates every ordered pair of the three terminals without error", () => {
    for (const sourceTerminal of ALL_TERMINALS) {
      for (const destinationTerminal of ALL_TERMINALS) {
        if (sourceTerminal === destinationTerminal) {
          continue;
        }

        const source = makeProjectWith(sourceTerminal, {
          font: { family: "JetBrains Mono", size: 13 },
          colors: { foreground: "#c6d0f5", background: "#303446" },
          window: { opacity: 0.92 },
        });

        const result = translateProject(
          source,
          destinationTerminal,
          "Translated",
        );

        expect(result.project.terminal).toBe(destinationTerminal);
        expect(result.report.sourceTerminal).toBe(sourceTerminal);
        expect(result.report.destinationTerminal).toBe(destinationTerminal);
        expect(result.report.items.length).toBeGreaterThan(0);
      }
    }
  });
});
