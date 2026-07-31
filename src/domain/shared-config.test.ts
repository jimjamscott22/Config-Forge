import { describe, expect, test } from "vitest";
import { makeSharedConfig } from "../test/fixtures/shared-config";
import { sharedConfigSchema } from "./shared-config";

describe("sharedConfigSchema", () => {
  test("accepts a portable Ghostty-like profile", () => {
    const config = makeSharedConfig();
    config.font = {
      family: "JetBrains Mono",
      boldFamily: null,
      italicFamily: null,
      boldItalicFamily: null,
      size: 13,
    };
    config.colors = {
      foreground: "#c6d0f5",
      background: "#303446",
      cursor: "#f2d5cf",
      cursorText: null,
      selectionBackground: "#626880",
      selectionForeground: null,
      ansi: {
        black: "#51576d",
        red: "#e78284",
      },
    };
    config.window = {
      opacity: 0.92,
      paddingX: 10,
      paddingY: 10,
      decorations: "system",
    };
    config.cursor = { shape: "block", blink: true };
    config.behavior = {
      scrollbackLines: 10_000,
      visualBell: false,
      attentionOnBell: false,
      copyOnSelect: false,
      middleClickPaste: true,
      confirmClose: true,
    };

    expect(sharedConfigSchema.safeParse(config).success).toBe(true);
  });

  test("rejects opacity above one", () => {
    const config = makeSharedConfig();
    config.window.opacity = 1.4;

    expect(sharedConfigSchema.safeParse(config).success).toBe(false);
  });

  test("rejects unsupported ANSI color names", () => {
    const config = makeSharedConfig();
    config.colors.ansi = { orange: "#ff8800" };

    expect(sharedConfigSchema.safeParse(config).success).toBe(false);
  });

  test("rejects abbreviated hex colors", () => {
    const config = makeSharedConfig();
    config.colors.foreground = "#fff";

    expect(sharedConfigSchema.safeParse(config).success).toBe(false);
  });
});
