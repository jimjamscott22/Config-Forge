import { invoke } from "@tauri-apps/api/core";
import { describe, expect, test, vi } from "vitest";
import type { DetectedInstallation } from "../adapters/terminal-adapter";
import { detectTerminals } from "./tauri-client";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("detectTerminals", () => {
  test("invokes detect_terminals and returns the detected installations", async () => {
    const installations: DetectedInstallation[] = [
      {
        terminal: "ghostty",
        binaryPath: "/usr/bin/ghostty",
        configPaths: ["/home/user/.config/ghostty/config"],
        version: null,
      },
      {
        terminal: "kitty",
        binaryPath: null,
        configPaths: [],
        version: null,
      },
    ];
    vi.mocked(invoke).mockResolvedValue(installations);

    const result = await detectTerminals();

    expect(invoke).toHaveBeenCalledWith("detect_terminals");
    expect(result).toEqual(installations);
  });
});
