import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { TerminalProject } from "../../domain/project";
import type { ParseResult } from "../terminal-adapter";
import { alacrittyAdapter, type AlacrittyOverrides } from "./alacritty-adapter";
import { isTomlKnownSettingNode } from "./alacritty-document";

const source = readFileSync("fixtures/alacritty/representative.toml", "utf8");

function makeAlacrittyProject(
  parsed: ParseResult<AlacrittyOverrides>,
): TerminalProject {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Daily Alacritty",
    terminal: "alacritty",
    shared: parsed.shared,
    overrides: parsed.overrides,
    document: parsed.document,
    unmappedNodeIds: parsed.unmappedNodeIds,
    sourcePath: "/home/user/.config/alacritty/alacritty.toml",
    destinationPath: null,
    createdAt: "2026-08-09T12:00:00.000Z",
    updatedAt: "2026-08-09T12:00:00.000Z",
  };
}

describe("alacrittyAdapter", () => {
  test("parses portable values and records source spans", () => {
    const parsed = alacrittyAdapter.parse(source);
    const sizeNode = parsed.document.find(
      (node) => node.kind === "known-setting" && node.key === "font.size",
    );
    const unknown = parsed.document.find(
      (node) =>
        node.kind === "unknown-setting" && node.key === "custom.future.keep",
    );

    expect(parsed.shared.font.family).toBe("JetBrains Mono");
    expect(parsed.shared.font.size).toBe(13);
    expect(parsed.shared.window.opacity).toBe(0.92);
    expect(parsed.shared.window.paddingX).toBe(10);
    expect(parsed.shared.window.paddingY).toBe(10);
    expect(parsed.shared.colors.foreground).toBe("#c6d0f5");
    expect(parsed.shared.cursor.shape).toBe("block");
    expect(parsed.shared.cursor.blink).toBe(true);
    expect(sizeNode && isTomlKnownSettingNode(sizeNode)).toBe(true);
    expect(sizeNode).toMatchObject({
      kind: "known-setting",
      key: "font.size",
      value: "13.0",
      modelPath: "font.size",
    });
    expect(unknown).toBeDefined();
    expect(parsed.unmappedNodeIds).toContain(unknown?.id);
    expect(parsed.overrides["custom.future.keep"]).toEqual(['"me"']);
  });

  test("changes one value without losing comments or unknown tables", () => {
    const parsed = alacrittyAdapter.parse(source);
    const project = makeAlacrittyProject(parsed);
    project.shared.font.size = 14;

    const generated = alacrittyAdapter.generate(project);

    expect(generated.source).toContain("# Daily Alacritty profile");
    expect(generated.source).toContain("[custom.future]");
    expect(generated.source).toContain('keep = "me"');
    expect(generated.source).toMatch(/size\s*=\s*14(?:\.0)?/);
    expect(generated.source).not.toContain("size = 13.0");
    expect(generated.changedNodeIds).toHaveLength(1);
    expect(() => alacrittyAdapter.parse(generated.source)).not.toThrow();
  });

  test("returns unchanged source byte-for-byte when the model is unchanged", () => {
    const project = makeAlacrittyProject(alacrittyAdapter.parse(source));

    expect(alacrittyAdapter.generate(project).source).toBe(source);
  });

  test("finds inline comments without treating hashes in strings as comments", () => {
    const commentedSource = [
      "[font]",
      "size = 13.0 # portable size",
      "",
      "[font.normal]",
      'family = "Mono #1" # keep this note',
      "",
    ].join("\n");
    const parsed = alacrittyAdapter.parse(commentedSource);
    const project = makeAlacrittyProject(parsed);
    project.shared.font.size = 15;

    expect(parsed.shared.font.family).toBe("Mono #1");
    expect(alacrittyAdapter.generate(project).source).toBe(
      [
        "[font]",
        "size = 15 # portable size",
        "",
        "[font.normal]",
        'family = "Mono #1" # keep this note',
        "",
      ].join("\n"),
    );
  });

  test("appends missing values to existing and new tables", () => {
    const parsed = alacrittyAdapter.parse(
      [
        "[font]",
        "size = 13.0",
        "",
        "[window]",
        "opacity = 0.9",
        "",
        "[custom.future]",
        'keep = "me"',
        "",
      ].join("\n"),
    );
    const project = makeAlacrittyProject(parsed);
    project.shared.font.family = "Iosevka";
    project.shared.window.opacity = 0.8;
    project.shared.window.paddingX = 8;
    project.shared.window.paddingY = 12;

    const generated = alacrittyAdapter.generate(project).source;
    const reparsed = alacrittyAdapter.parse(generated);

    expect(generated).toContain("[font.normal]");
    expect(generated).toContain('family = "Iosevka"');
    expect(generated).toContain("[window]");
    expect(generated).toContain("opacity = 0.8");
    expect(generated).toContain("padding = { x = 8, y = 12 }");
    expect(generated.indexOf("padding =")).toBeLessThan(
      generated.indexOf("[custom.future]"),
    );
    expect(reparsed.shared.font.family).toBe("Iosevka");
    expect(reparsed.shared.window.opacity).toBe(0.8);
    expect(reparsed.shared.window.paddingX).toBe(8);
    expect(reparsed.shared.window.paddingY).toBe(12);
  });

  test("generates a portable project as valid Alacritty TOML", () => {
    const project = makeAlacrittyProject(alacrittyAdapter.parse(""));
    project.shared.font.family = "Iosevka";
    project.shared.font.boldFamily = "Iosevka Bold";
    project.shared.font.size = 15;
    project.shared.colors.foreground = "#abcdef";
    project.shared.colors.background = "#123456";
    project.shared.colors.ansi.red = "#ff0000";
    project.shared.colors.ansi.brightBlue = "#0000ff";
    project.shared.window.opacity = 0.8;
    project.shared.window.paddingX = 6;
    project.shared.window.paddingY = 8;
    project.shared.window.decorations = "system";
    project.shared.cursor.shape = "beam";
    project.shared.cursor.blink = false;
    project.shared.behavior.scrollbackLines = 20_000;
    project.shared.behavior.copyOnSelect = true;
    project.shared.behavior.visualBell = true;

    const generated = alacrittyAdapter.generate(project).source;
    const reparsed = alacrittyAdapter.parse(generated);

    expect(reparsed.issues).toEqual([]);
    expect(reparsed.shared).toEqual(project.shared);
    expect(generated).toContain('shape = "Beam"');
    expect(generated).toContain('blinking = "Off"');
    expect(generated).toContain("duration = 150");
  });

  test("preserves valid native values that are not portable", () => {
    const unsupportedSource = [
      "[window]",
      "opacity = 0.0",
      'decorations = "Transparent"',
      "",
      "[cursor.style]",
      'blinking = "Always"',
      "",
    ].join("\n");
    const parsed = alacrittyAdapter.parse(unsupportedSource);

    expect(parsed.shared.window.opacity).toBeNull();
    expect(parsed.shared.window.decorations).toBeNull();
    expect(parsed.shared.cursor.blink).toBe(true);
    expect(parsed.unmappedNodeIds).toHaveLength(2);
    expect(parsed.issues.map((issue) => issue.code)).toEqual([
      "ALACRITTY_UNSUPPORTED_VALUE",
      "ALACRITTY_UNSUPPORTED_VALUE",
    ]);
    expect(alacrittyAdapter.generate(makeAlacrittyProject(parsed)).source).toBe(
      unsupportedSource,
    );
  });

  test("reports invalid TOML without discarding its source", () => {
    const invalidSource = "[font]\nsize = nope\n";
    const parsed = alacrittyAdapter.parse(invalidSource);

    expect(parsed.issues).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "ALACRITTY_INVALID_TOML",
      }),
    ]);
    expect(parsed.unmappedNodeIds).toHaveLength(parsed.document.length);
    expect(alacrittyAdapter.generate(makeAlacrittyProject(parsed)).source).toBe(
      invalidSource,
    );
  });
});
