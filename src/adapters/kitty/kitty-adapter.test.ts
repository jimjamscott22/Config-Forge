import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { TerminalProject } from "../../domain/project";
import type { ParseResult } from "../terminal-adapter";
import { kittyAdapter, type KittyOverrides } from "./kitty-adapter";
import { parseKittyLine } from "./kitty-parser";

const source = readFileSync("fixtures/kitty/representative.conf", "utf8");

function makeKittyProject(
  parsed: ParseResult<KittyOverrides>,
): TerminalProject {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Daily Kitty",
    terminal: "kitty",
    shared: parsed.shared,
    overrides: parsed.overrides,
    document: parsed.document,
    unmappedNodeIds: parsed.unmappedNodeIds,
    sourcePath: "/home/user/.config/kitty/kitty.conf",
    destinationPath: null,
    createdAt: "2026-08-09T12:00:00.000Z",
    updatedAt: "2026-08-09T12:00:00.000Z",
  };
}

describe("kittyAdapter", () => {
  test("parses portable values, includes, and preserved directives", () => {
    const result = kittyAdapter.parse(source);
    const include = result.document.find((node) => node.kind === "include");

    expect(result.shared.font.family).toBe("JetBrains Mono");
    expect(result.shared.font.size).toBe(13);
    expect(result.shared.colors.foreground).toBe("#c6d0f5");
    expect(result.shared.window.opacity).toBe(0.92);
    expect(result.shared.cursor.shape).toBe("block");
    expect(result.shared.behavior.scrollbackLines).toBe(10000);
    expect(include).toMatchObject({
      kind: "include",
      target: "themes/custom.conf",
    });
    expect(result.unmappedNodeIds).toContain(include?.id);
    expect(result.overrides.map).toEqual(["ctrl+shift+t new_tab"]);
    expect(result.overrides.future_kitty_setting).toEqual(["keep-me"]);
  });

  test("does not flatten or remove preserved directives during generation", () => {
    const sourceWithMouseMap = `${source}mouse_map left press ungrabbed mouse_select_command_output\n`;
    const result = kittyAdapter.parse(sourceWithMouseMap);
    const project = makeKittyProject(result);
    project.shared.window.opacity = 0.8;

    const generated = kittyAdapter.generate(project);

    expect(generated.source).toContain("include themes/custom.conf");
    expect(generated.source).toContain("map ctrl+shift+t new_tab");
    expect(generated.source).toContain(
      "mouse_map left press ungrabbed mouse_select_command_output",
    );
    expect(generated.source).toContain("background_opacity 0.8");
    expect(generated.source).toContain("future_kitty_setting keep-me");
    expect(generated.source.endsWith("\n")).toBe(true);
    expect(generated.source.endsWith("\n\n")).toBe(false);
    expect(generated.changedNodeIds).toHaveLength(1);
  });

  test("returns unchanged source byte-for-byte when the model is unchanged", () => {
    const project = makeKittyProject(kittyAdapter.parse(source));

    expect(kittyAdapter.generate(project).source).toBe(source);
  });

  test("uses the last repeated key and rewrites only its effective node", () => {
    const repeatedSource = [
      "font_size 11.0",
      "# Keep the fallback above",
      "font_size 13.0",
      "",
    ].join("\n");
    const parsed = kittyAdapter.parse(repeatedSource);
    expect(parsed.shared.font.size).toBe(13);

    const project = makeKittyProject(parsed);
    project.shared.font.size = 15;
    const generated = kittyAdapter.generate(project);

    expect(generated.source).toBe(
      ["font_size 11.0", "# Keep the fallback above", "font_size 15", ""].join(
        "\n",
      ),
    );
    expect(generated.changedNodeIds).toEqual([parsed.document[2]?.id]);
  });

  test("maps Kitty booleans and cursor blink intervals losslessly", () => {
    const parsed = kittyAdapter.parse(
      [
        "cursor_blink_interval 0",
        "copy_on_select clipboard",
        "enable_audio_bell no",
        "",
      ].join("\n"),
    );

    expect(parsed.shared.cursor.blink).toBe(false);
    expect(parsed.shared.behavior.copyOnSelect).toBe(true);
    expect(parsed.shared.behavior.visualBell).toBe(false);

    const project = makeKittyProject(parsed);
    project.shared.cursor.blink = true;
    project.shared.behavior.copyOnSelect = false;

    expect(kittyAdapter.generate(project).source).toBe(
      [
        "cursor_blink_interval 0.5",
        "copy_on_select no",
        "enable_audio_bell no",
        "",
      ].join("\n"),
    );
  });

  test("appends newly populated settings under a Config Forge heading", () => {
    const parsed = kittyAdapter.parse("font_family Iosevka\n");
    const project = makeKittyProject(parsed);
    project.shared.window.paddingX = 12;
    project.shared.behavior.visualBell = true;

    expect(kittyAdapter.generate(project).source).toBe(
      [
        "font_family Iosevka",
        "",
        "# Added by Config Forge",
        "window_padding_width 12",
        "enable_audio_bell yes",
        "",
      ].join("\n"),
    );
  });

  test("classifies Kitty lines and assigns deterministic stable IDs", () => {
    const blank = parseKittyLine("   ", 1);
    const comment = parseKittyLine("# note", 2);
    const include = parseKittyLine("include theme.conf", 3);
    const known = parseKittyLine("font_size 13.0", 4);
    const unknown = parseKittyLine("map ctrl+t new_tab", 5);
    const malformed = parseKittyLine("  # not-a-comment", 6);

    expect(blank.kind).toBe("blank");
    expect(comment.kind).toBe("comment");
    expect(include).toMatchObject({ kind: "include", target: "theme.conf" });
    expect(known).toMatchObject({
      kind: "known-setting",
      key: "font_size",
      value: "13.0",
      modelPath: "font.size",
    });
    expect(unknown).toMatchObject({
      kind: "unknown-setting",
      key: "map",
      value: "ctrl+t new_tab",
    });
    expect(malformed).toMatchObject({
      kind: "malformed",
      reason: "Missing or invalid directive value separator",
    });
    expect(parseKittyLine("font_size 13.0", 4).id).toBe(known.id);
  });

  test("preserves native values that cannot be represented portably", () => {
    const unsupportedSource = [
      "font_family family=JetBrains Mono",
      "cursor none",
      "cursor_blink_interval -1 linear ease-out",
      "window_padding_width 2.5",
      "copy_on_select private-buffer",
      "",
    ].join("\n");
    const parsed = kittyAdapter.parse(unsupportedSource);

    expect(parsed.shared.font.family).toBeNull();
    expect(parsed.shared.colors.cursor).toBeNull();
    expect(parsed.shared.cursor.blink).toBeNull();
    expect(parsed.shared.window.paddingX).toBeNull();
    expect(parsed.shared.behavior.copyOnSelect).toBeNull();
    expect(parsed.unmappedNodeIds).toHaveLength(5);
    expect(
      parsed.issues.every((issue) => issue.code === "KITTY_UNSUPPORTED_VALUE"),
    ).toBe(true);
    expect(kittyAdapter.generate(makeKittyProject(parsed)).source).toBe(
      unsupportedSource,
    );
  });
});
