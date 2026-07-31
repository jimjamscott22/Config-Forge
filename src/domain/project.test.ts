import { describe, expect, test } from "vitest";
import { makeSharedConfig } from "../test/fixtures/shared-config";
import { terminalProjectSchema } from "./project";

function makeProjectRecord() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Daily Ghostty",
    terminal: "ghostty",
    shared: makeSharedConfig(),
    overrides: {},
    sourcePath: "/home/user/.config/ghostty/config",
    destinationPath: null,
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T12:00:00.000Z",
  };
}

describe("terminalProjectSchema", () => {
  test("accepts a valid project record", () => {
    expect(terminalProjectSchema.safeParse(makeProjectRecord()).success).toBe(
      true,
    );
  });

  test("rejects unsupported terminals", () => {
    const project = makeProjectRecord();
    project.terminal = "wezterm";

    expect(terminalProjectSchema.safeParse(project).success).toBe(false);
  });

  test("rejects project names longer than 120 characters", () => {
    const project = makeProjectRecord();
    project.name = "x".repeat(121);

    expect(terminalProjectSchema.safeParse(project).success).toBe(false);
  });
});
