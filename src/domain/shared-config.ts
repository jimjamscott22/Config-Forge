import { z } from "zod";

export const terminalIdSchema = z.enum(["ghostty", "kitty", "alacritty"]);
export type TerminalId = z.infer<typeof terminalIdSchema>;

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Expected a six-digit hex color");
// Values are written verbatim into line-based configs, so a newline would let
// an imported template inject extra settings such as `command` or `shell`.
function isControlCharacter(character: string) {
  const code = character.charCodeAt(0);
  return code <= 0x1f || code === 0x7f;
}
const fontFamilySchema = z
  .string()
  .min(1)
  .refine((value) => ![...value].some(isControlCharacter), {
    message: "Must not contain control characters or line breaks",
  })
  .nullable();
const nullableHexColorSchema = hexColorSchema.nullable();

export const ansiColorNames = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

export type AnsiColorName = (typeof ansiColorNames)[number];

export const sharedConfigSchema = z.object({
  font: z.object({
    family: fontFamilySchema,
    boldFamily: fontFamilySchema,
    italicFamily: fontFamilySchema,
    boldItalicFamily: fontFamilySchema,
    size: z.number().min(6).max(96).nullable(),
  }),
  colors: z.object({
    foreground: nullableHexColorSchema,
    background: nullableHexColorSchema,
    cursor: nullableHexColorSchema,
    cursorText: nullableHexColorSchema,
    selectionBackground: nullableHexColorSchema,
    selectionForeground: nullableHexColorSchema,
    ansi: z.partialRecord(z.enum(ansiColorNames), hexColorSchema),
  }),
  window: z.object({
    opacity: z.number().min(0.1).max(1).nullable(),
    paddingX: z.number().int().min(0).max(200).nullable(),
    paddingY: z.number().int().min(0).max(200).nullable(),
    decorations: z.enum(["system", "client", "none"]).nullable(),
  }),
  cursor: z.object({
    shape: z.enum(["block", "beam", "underline"]).nullable(),
    blink: z.boolean().nullable(),
  }),
  behavior: z.object({
    scrollbackLines: z.number().int().min(0).max(10_000_000).nullable(),
    visualBell: z.boolean().nullable(),
    attentionOnBell: z.boolean().nullable(),
    copyOnSelect: z.boolean().nullable(),
    middleClickPaste: z.boolean().nullable(),
    confirmClose: z.boolean().nullable(),
  }),
});

export type SharedConfig = z.infer<typeof sharedConfigSchema>;
