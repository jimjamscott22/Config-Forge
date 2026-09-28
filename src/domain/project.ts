import { z } from "zod";
import { documentNodeSchema, type DocumentNode } from "./document-node";
import { sharedConfigSchema, terminalIdSchema } from "./shared-config";

export const terminalProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  terminal: terminalIdSchema,
  shared: sharedConfigSchema,
  overrides: z.record(z.string(), z.unknown()),
  sourcePath: z.string().nullable(),
  destinationPath: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TerminalProjectRecord = z.infer<typeof terminalProjectSchema>;

export interface TerminalProject extends TerminalProjectRecord {
  document: DocumentNode[];
  unmappedNodeIds: string[];
}

export const projectPayloadSchema = terminalProjectSchema.extend({
  document: z.array(documentNodeSchema),
  unmappedNodeIds: z.array(z.string()),
});
