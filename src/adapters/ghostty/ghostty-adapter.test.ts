import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { TerminalProject } from "../../domain/project";
import type { ParseResult } from "../terminal-adapter";
import { ghosttyAdapter, type GhosttyOverrides } from "./ghostty-adapter";
import { parseGhosttyLine } from "./ghostty-parser";

const source = readFileSync("fixtures/ghostty/representative.conf", "utf8");

function makeGhosttyProject(
  parsed: ParseResult<GhosttyOverrides>,
): TerminalProject {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Daily Ghostty",
    terminal: "ghostty",
    shared: parsed.shared,
    overrides: parsed.overrides,
    document: parsed.document,
    unmappedNodeIds: parsed.unmappedNodeIds,
    sourcePath: "/home/user/.config/ghostty/config",
    destinationPath: null,
    createdAt: "2026-08-09T12:00:00.000Z",
    updatedAt: "2026-08-09T12:00:00.000Z",
  };
}

describe("ghosttyAdapter", () => {
  test("parses portable values and preserves unknown lines", () => {
    const parsed = ghosttyAdapter.parse(source);
    const unknown = parsed.document.find(
      (node) =>
        node.kind === "unknown-setting" && node.key === "custom-future-option",
    );

    expect(parsed.shared.font.family).toBe("JetBrains Mono");
    expect(parsed.shared.font.size).toBe(13);
    expect(parsed.shared.colors.background).toBe("#303446");
    expect(parsed.shared.window.opacity).toBe(0.92);
    expect(parsed.shared.behavior.attentionOnBell).toBe(false);
    expect(unknown).toBeDefined();
    expect(parsed.unmappedNodeIds).toContain(unknown?.id);
    expect(parsed.overrides["custom-future-option"]).toEqual(["keep-me"]);
  });

  test("changes one known value without losing preserved content", () => {
    const parsed = ghosttyAdapter.parse(source);
    const project = makeGhosttyProject(parsed);
    project.shared.font.size = 14;

    const generated = ghosttyAdapter.generate(project);

    expect(generated.source).toContain("# Jamie's daily Ghostty profile");
    expect(generated.source).toContain("font-size = 14");
    expect(generated.source).toContain("custom-future-option = keep-me");
    expect(generated.source.endsWith("\n")).toBe(true);
    expect(generated.source.endsWith("\n\n")).toBe(false);
    expect(generated.changedNodeIds).toHaveLength(1);
  });

  test("returns unchanged source byte-for-byte when the model is unchanged", () => {
    const project = makeGhosttyProject(ghosttyAdapter.parse(source));

    expect(ghosttyAdapter.generate(project).source).toBe(source);
  });

  test("uses the last repeated key and only rewrites that effective node", () => {
    const repeatedSource = [
      "font-size = 11",
      "# Keep the fallback above",
      "font-size=13",
      "",
    ].join("\n");
    const parsed = ghosttyAdapter.parse(repeatedSource);
    expect(parsed.shared.font.size).toBe(13);

    const project = makeGhosttyProject(parsed);
    project.shared.font.size = 15;

    const generated = ghosttyAdapter.generate(project);

    expect(generated.source).toBe(
      [
        "font-size = 11",
        "# Keep the fallback above",
        "font-size = 15",
        "",
      ].join("\n"),
    );
    expect(generated.changedNodeIds).toEqual([parsed.document[2]?.id]);
  });

  test("appends newly populated settings under a Config Forge heading", () => {
    const parsed = ghosttyAdapter.parse("font-family = Iosevka\n");
    const project = makeGhosttyProject(parsed);
    project.shared.cursor.blink = true;

    expect(ghosttyAdapter.generate(project).source).toBe(
      [
        "font-family = Iosevka",
        "",
        "# Added by Config Forge",
        "cursor-style-blink = true",
        "",
      ].join("\n"),
    );
  });

  test("classifies lines and assigns deterministic stable IDs", () => {
    const blank = parseGhosttyLine("   ", 1);
    const comment = parseGhosttyLine("  # note", 2);
    const known = parseGhosttyLine("font-size = 13", 3);
    const unknown = parseGhosttyLine("future-option = yes", 4);
    const malformed = parseGhosttyLine("font-size 13", 5);

    expect(blank.kind).toBe("blank");
    expect(comment.kind).toBe("comment");
    expect(known).toMatchObject({
      kind: "known-setting",
      key: "font-size",
      value: "13",
      modelPath: "font.size",
    });
    expect(unknown).toMatchObject({
      kind: "unknown-setting",
      key: "future-option",
      value: "yes",
    });
    expect(malformed).toMatchObject({
      kind: "malformed",
      reason: "Missing or invalid key-value separator",
    });
    expect(parseGhosttyLine("font-size = 13", 3).id).toBe(known.id);
  });

  test("reports mapped native values that cannot be represented portably", () => {
    const unsupportedSource =
      "window-padding-x = 2,4\ncursor-style = block_hollow\n";
    const parsed = ghosttyAdapter.parse(unsupportedSource);

    expect(parsed.shared.window.paddingX).toBeNull();
    expect(parsed.shared.cursor.shape).toBeNull();
    expect(parsed.unmappedNodeIds).toHaveLength(2);
    expect(parsed.issues.map((issue) => issue.code)).toEqual([
      "GHOSTTY_UNSUPPORTED_VALUE",
      "GHOSTTY_UNSUPPORTED_VALUE",
    ]);
    expect(ghosttyAdapter.generate(makeGhosttyProject(parsed)).source).toBe(
      unsupportedSource,
    );
  });
});
