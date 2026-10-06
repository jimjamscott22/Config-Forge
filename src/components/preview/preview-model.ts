import type { CSSProperties } from "react";
import {
  ansiColorNames,
  type SharedConfig,
  type TerminalId,
} from "../../domain/shared-config";

const fallbackPalette = [
  "#20252b",
  "#e57878",
  "#9fc98a",
  "#e3c58b",
  "#8eb4dc",
  "#c9a0dc",
  "#8bcac3",
  "#d8dce3",
  "#66717e",
  "#ffa0a0",
  "#c0e4aa",
  "#ffe1a8",
  "#b4d4ff",
  "#e7bfff",
  "#b0eee5",
  "#ffffff",
];
export interface PreviewModel {
  style: CSSProperties & Record<`--preview-${string}`, string>;
  palette: Array<{ name: string; color: string }>;
  cursorShape: "block" | "beam" | "underline";
  cursorBlink: boolean;
  decorations: "system" | "client" | "none";
  scrollbackLines: number | null;
}

function fontStack(family: string | null): string {
  // Treat the configured name as one family, not arbitrary CSS syntax.
  return family ? `${JSON.stringify(family)}, monospace` : "var(--mono)";
}

export function buildPreviewModel(
  shared: SharedConfig,
  terminal?: TerminalId,
): PreviewModel {
  const foreground = shared.colors.foreground ?? "#d8dce3";
  const background = shared.colors.background ?? "#20252b";
  const palette = ansiColorNames.map((name, index) => ({
    name,
    color: shared.colors.ansi[name] ?? fallbackPalette[index] ?? foreground,
  }));
  return {
    style: {
      color: foreground,
      backgroundColor: background,
      opacity: shared.window.opacity ?? 1,
      fontFamily: fontStack(shared.font.family),
      fontSize: `${shared.font.size ?? 13}pt`,
      paddingInline: `${shared.window.paddingX ?? 16}px`,
      paddingBlock: `${(terminal === "kitty" ? shared.window.paddingX : shared.window.paddingY) ?? 16}px`,
      "--preview-cursor": shared.colors.cursor ?? foreground,
      "--preview-cursor-text": shared.colors.cursorText ?? background,
      "--preview-selection-background":
        shared.colors.selectionBackground ?? "#43556c",
      "--preview-selection-foreground":
        shared.colors.selectionForeground ?? foreground,
      "--preview-bold-font": fontStack(
        shared.font.boldFamily ?? shared.font.family,
      ),
      "--preview-italic-font": fontStack(
        shared.font.italicFamily ?? shared.font.family,
      ),
      "--preview-bold-italic-font": fontStack(
        shared.font.boldItalicFamily ??
          shared.font.boldFamily ??
          shared.font.italicFamily ??
          shared.font.family,
      ),
      "--preview-green": palette[2]?.color ?? foreground,
      "--preview-blue": palette[4]?.color ?? foreground,
    },
    palette,
    cursorShape: shared.cursor.shape ?? "block",
    cursorBlink: shared.cursor.blink ?? false,
    decorations: shared.window.decorations ?? "system",
    scrollbackLines: shared.behavior.scrollbackLines,
  };
}
