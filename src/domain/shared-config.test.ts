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

test("font families reject control characters but accept normal names", () => {
  const base = sharedConfigSchema.parse({
    font: {
      family: "JetBrains Mono",
      boldFamily: null,
      italicFamily: null,
      boldItalicFamily: null,
      size: null,
    },
    colors: {
      foreground: null,
      background: null,
      cursor: null,
      cursorText: null,
      selectionBackground: null,
      selectionForeground: null,
      ansi: {},
    },
    window: {
      opacity: null,
      paddingX: null,
      paddingY: null,
      decorations: null,
    },
    cursor: { shape: null, blink: null },
    behavior: {
      scrollbackLines: null,
      visualBell: null,
      attentionOnBell: null,
      copyOnSelect: null,
      middleClickPaste: null,
      confirmClose: null,
    },
  });
  for (const bad of [
    "a\nb",
    "a\rb",
    "a\tb",
    "a\u0000b",
    "a\u007fb",
    "a\u0085b",
    "a\u2028b",
    "a\u2029b",
    "a\u009fb",
  ]) {
    expect(
      sharedConfigSchema.safeParse({
        ...base,
        font: { ...base.font, family: bad },
      }).success,
    ).toBe(false);
  }
});
