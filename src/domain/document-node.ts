import { z } from "zod";

const nodeBaseSchema = z.object({
  id: z.string(),
  originalText: z.string(),
  originalLine: z.number().int().nonnegative(),
  modified: z.boolean(),
});

export const documentNodeSchema = z.discriminatedUnion("kind", [
  nodeBaseSchema.extend({ kind: z.literal("comment") }),
  nodeBaseSchema.extend({ kind: z.literal("blank") }),
  nodeBaseSchema.extend({
    kind: z.literal("known-setting"),
    key: z.string(),
    value: z.string(),
    modelPath: z.string(),
    valueStart: z.number().int().nonnegative().optional(),
    valueEnd: z.number().int().nonnegative().optional(),
  }),
  nodeBaseSchema.extend({
    kind: z.literal("unknown-setting"),
    key: z.string(),
    value: z.string(),
  }),
  nodeBaseSchema.extend({ kind: z.literal("include"), target: z.string() }),
  nodeBaseSchema.extend({
    kind: z.literal("section"),
    name: z.string(),
    array: z.boolean().optional(),
  }),
  nodeBaseSchema.extend({ kind: z.literal("malformed"), reason: z.string() }),
]);

export interface NodeBase {
  id: string;
  originalText: string;
  originalLine: number;
  modified: boolean;
}

export type DocumentNode =
  | (NodeBase & { kind: "comment" })
  | (NodeBase & { kind: "blank" })
  | (NodeBase & {
      kind: "known-setting";
      key: string;
      value: string;
      modelPath: string;
      valueStart?: number;
      valueEnd?: number;
    })
  | (NodeBase & {
      kind: "unknown-setting";
      key: string;
      value: string;
    })
  | (NodeBase & { kind: "include"; target: string })
  | (NodeBase & { kind: "section"; name: string; array?: boolean })
  | (NodeBase & { kind: "malformed"; reason: string });
