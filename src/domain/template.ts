import { z } from "zod";
import { sharedConfigSchema } from "./shared-config";

export const configTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string(),
  terminal: z.enum(["ghostty", "kitty", "alacritty", "portable"]),
  builtIn: z.boolean(),
  shared: sharedConfigSchema,
  overrides: z.record(z.string(), z.unknown()),
  attribution: z
    .object({ name: z.string(), license: z.string(), url: z.url() })
    .optional(),
});
export type ConfigTemplate = z.infer<typeof configTemplateSchema>;
