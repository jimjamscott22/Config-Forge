import { invoke } from "@tauri-apps/api/core";
import { describe, expect, test, vi } from "vitest";
import type { DetectedInstallation } from "../adapters/terminal-adapter";
import {
  detectTerminals,
  projectClient,
  writeFileAtomically,
  validateCandidate,
} from "./tauri-client";

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

test("dispatches typed apply requests with the confirmed source precondition", async () => {
  const request = {
    target: "/target",
    candidate: "candidate",
    expectedSource: "original",
  };
  const receipt = { bytesWritten: 9, sha256: "hash" };
  vi.mocked(invoke).mockResolvedValueOnce(receipt);
  expect(await projectClient.applyConfig(request)).toEqual(receipt);
  expect(invoke).toHaveBeenLastCalledWith("apply_config", { request });
  vi.mocked(invoke).mockRejectedValueOnce(new Error("destination changed"));
  await expect(projectClient.applyConfig(request)).rejects.toThrow(
    "destination changed",
  );
});

test("keeps the existing backup, write and native validation command contracts", async () => {
  await projectClient.createBackup({
    target: "/target",
    backupRoot: "/backups",
  });
  expect(invoke).toHaveBeenLastCalledWith("create_config_backup", {
    target: "/target",
    backupRoot: "/backups",
  });
  await writeFileAtomically("/target", "candidate");
  expect(invoke).toHaveBeenLastCalledWith("write_file_atomically", {
    target: "/target",
    candidate: "candidate",
  });
  const request = {
    terminal: "ghostty" as const,
    binaryPath: "/usr/bin/ghostty",
    candidatePath: "/tmp/candidate",
  };
  await validateCandidate(request);
  expect(invoke).toHaveBeenLastCalledWith("validate_candidate", { request });
});
