import { z } from "zod";
import { projectPayloadSchema } from "./project";

export const automaticSnapshotReasonSchema = z.enum([
  "before-import-replacement",
  "before-translation",
  "before-direct-apply",
  "before-restore",
  "before-destructive-source-reconcile",
  "before-template-replacement",
]);
export type AutomaticSnapshotReason = z.infer<
  typeof automaticSnapshotReasonSchema
>;
export const snapshotSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    createdAt: z.string().datetime(),
    project: projectPayloadSchema,
  })
  .and(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("named"),
        label: z.string().trim().min(1).max(120),
        reason: z.null(),
      }),
      z.object({
        kind: z.literal("automatic"),
        label: z.null(),
        reason: automaticSnapshotReasonSchema,
      }),
    ]),
  )
  .refine(
    (snapshot) => snapshot.project.id === snapshot.projectId,
    "Snapshot payload must belong to its project.",
  );
export type ProjectSnapshot = z.infer<typeof snapshotSchema>;
export type SnapshotDetails =
  | { kind: "named"; label: string }
  | { kind: "automatic"; reason: AutomaticSnapshotReason };
