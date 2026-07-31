import { beforeEach, describe, expect, test } from "vitest";
import { sharedConfigSchema, type TerminalId } from "../domain/shared-config";
import { makeSharedConfig } from "../test/fixtures/shared-config";
import type { TerminalAdapter } from "./terminal-adapter";
import {
  adapterRegistry,
  clearAdaptersForTests,
  getAdapter,
  registerAdapter,
} from "./registry";

function createStubAdapter(terminal: TerminalId): TerminalAdapter {
  const shared = sharedConfigSchema.parse(makeSharedConfig());

  return {
    terminal,
    parse: () => ({
      shared,
      overrides: {},
      document: [],
      unmappedNodeIds: [],
      issues: [],
    }),
    generate: () => ({
      source: "",
      changedNodeIds: [],
      issues: [],
    }),
    validateInternal: () => ({
      valid: true,
      nativeAvailable: false,
      issues: [],
    }),
    extractPortable: (project) => ({
      shared: project.shared,
      omitted: [],
    }),
    createOverrides: () => ({}),
  };
}

describe("adapter registry", () => {
  beforeEach(() => {
    clearAdaptersForTests();
  });

  test("returns an adapter registered by terminal id", () => {
    const adapter = createStubAdapter("ghostty");

    registerAdapter(adapter);

    expect(getAdapter("ghostty")).toBe(adapter);
  });

  test("exposes the same registered adapters through adapterRegistry", () => {
    const adapter = createStubAdapter("alacritty");

    adapterRegistry.register(adapter);

    expect(adapterRegistry.get("alacritty")).toBe(adapter);
  });

  test("replaces an existing adapter for the same terminal", () => {
    const original = createStubAdapter("kitty");
    const replacement = createStubAdapter("kitty");

    registerAdapter(original);
    registerAdapter(replacement);

    expect(getAdapter("kitty")).toBe(replacement);
  });

  test("throws for an unregistered adapter", () => {
    expect(() => getAdapter("kitty")).toThrow(
      "No adapter registered for kitty",
    );
  });
});
