import { invoke } from "@tauri-apps/api/core";
import { describe, expect, test, vi } from "vitest";
import type { ValidationResult } from "../domain/validation";
import { makeProjectClient } from "../test/fixtures/project-client";
import { makeProject } from "./project-service";
import {
  applyProject,
  createApplyDependencies,
  createNativeValidationDependency,
  type ApplyDependencies,
} from "./apply-service";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const valid: ValidationResult = {
  valid: true,
  nativeAvailable: true,
  issues: [],
};
const warning = {
  id: "warning",
  severity: "warning" as const,
  code: "PRESERVED",
  message: "Check preserved setting",
};
function setup() {
  const calls: string[] = [];
  const project = makeProject({ name: "Daily", terminal: "ghostty" });
  const deps = {
    target: {
      path: "/target",
      backupRoot: "/backups",
      currentSource: "original",
    },
    generate: vi.fn(async () => {
      calls.push("generate");
      return "candidate";
    }),
    validateInternal: vi.fn(async () => {
      calls.push("validate-internal");
      return valid;
    }),
    validateNative: vi.fn(async () => {
      calls.push("validate-native");
      return valid;
    }),
    createDiff: vi.fn(async () => {
      calls.push("diff");
      return "diff";
    }),
    confirm: vi.fn(async () => {
      calls.push("confirm");
      return true;
    }),
    createSnapshot: vi.fn(async () => {
      calls.push("snapshot");
    }),
    createBackup: vi.fn(async () => {
      calls.push("backup");
      return { path: "/backup", sha256: "old" };
    }),
    atomicWrite: vi.fn(async () => {
      calls.push("atomic-write");
      return { bytesWritten: 9, sha256: "new" };
    }),
    verify: vi.fn(async () => {
      calls.push("verify");
    }),
  } satisfies ApplyDependencies;
  return { calls, project, deps };
}

describe("safe apply", () => {
  test("runs the required order and returns backup and write receipt", async () => {
    const { calls, project, deps } = setup();
    const result = await applyProject(project, deps);
    expect(calls).toEqual([
      "generate",
      "validate-internal",
      "validate-native",
      "diff",
      "confirm",
      "snapshot",
      "backup",
      "atomic-write",
      "verify",
    ]);
    expect(result).toEqual({
      status: "applied",
      backup: { path: "/backup", sha256: "old" },
      receipt: { bytesWritten: 9, sha256: "new" },
    });
    expect(deps.atomicWrite).toHaveBeenCalledWith({
      target: "/target",
      candidate: "candidate",
      expectedSource: "original",
    });
  });

  test("cancellation returns normally without snapshots, backups or writes", async () => {
    const { calls, project, deps } = setup();
    deps.confirm.mockImplementation(async () => {
      calls.push("confirm");
      return false;
    });
    expect(await applyProject(project, deps)).toEqual({ status: "cancelled" });
    expect(calls).toEqual([
      "generate",
      "validate-internal",
      "validate-native",
      "diff",
      "confirm",
    ]);
  });

  test.each(["internal", "native"] as const)(
    "%s validation errors block before confirmation",
    async (stage) => {
      const { project, deps } = setup();
      const blocked: ValidationResult = {
        ...valid,
        valid: false,
        issues: [{ ...warning, severity: "error" }],
      };
      if (stage === "internal")
        deps.validateInternal.mockResolvedValue(blocked);
      else deps.validateNative.mockResolvedValue(blocked);
      expect(await applyProject(project, deps)).toEqual({
        status: "blocked",
        issues: blocked.issues,
      });
      expect(deps.confirm).not.toHaveBeenCalled();
      expect(deps.atomicWrite).not.toHaveBeenCalled();
      if (stage === "internal")
        expect(deps.validateNative).not.toHaveBeenCalled();
    },
  );

  test("warnings and unavailable native validation reach confirmation", async () => {
    const { project, deps } = setup();
    deps.validateNative.mockResolvedValue({
      valid: true,
      nativeAvailable: false,
      issues: [warning],
    });
    await applyProject(project, deps);
    expect(deps.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ issues: [warning] }),
    );
  });

  test.each([
    "generate",
    "validateInternal",
    "validateNative",
    "createDiff",
    "confirm",
    "createSnapshot",
    "createBackup",
  ] as const)("%s failures cannot write a destination", async (stage) => {
    const { project, deps } = setup();
    deps[stage].mockRejectedValue(new Error("failed"));
    await expect(applyProject(project, deps)).rejects.toThrow("failed");
    expect(deps.atomicWrite).not.toHaveBeenCalled();
    if (stage === "createDiff")
      expect(deps.createBackup).not.toHaveBeenCalled();
  });

  test("write or verification failure is never reported as success", async () => {
    const { project, deps } = setup();
    deps.atomicWrite.mockRejectedValueOnce(new Error("write failed"));
    await expect(applyProject(project, deps)).rejects.toThrow("write failed");
    expect(deps.verify).not.toHaveBeenCalled();
    deps.verify.mockRejectedValueOnce(new Error("readback failed"));
    await expect(applyProject(project, deps)).rejects.toThrow(
      "readback failed",
    );
  });

  test("a new destination skips backup rather than failing on a missing source", async () => {
    const { project, deps } = setup();
    const result = await applyProject(project, {
      ...deps,
      target: { ...deps.target, currentSource: null },
    });
    expect(result).toMatchObject({ status: "applied", backup: null });
    expect(deps.createBackup).not.toHaveBeenCalled();
    expect(deps.atomicWrite).toHaveBeenCalledWith(
      expect.objectContaining({ expectedSource: null }),
    );
  });

  test("changes to the editor or target during confirmation do not change the reviewed write", async () => {
    const { project, deps } = setup();
    deps.confirm.mockImplementation(async () => {
      project.name = "Edited after generation";
      deps.target.path = "/different-target";
      deps.target.currentSource = "different source";
      return true;
    });
    await applyProject(project, deps);
    expect(deps.atomicWrite).toHaveBeenCalledWith({
      target: "/target",
      candidate: "candidate",
      expectedSource: "original",
    });
  });

  test("default dependencies generate preserved source, snapshot the draft, and verify readback", async () => {
    const { client } = makeProjectClient();
    const project = makeProject({
      name: "Daily",
      terminal: "ghostty",
      source: "# preserved\nfont-size = 13\n",
    });
    const source = "# preserved\nfont-size = 13\n";
    client.applyConfig.mockResolvedValue({
      bytesWritten: new TextEncoder().encode(source).length,
      sha256: "hash",
    });
    client.readTextFile.mockResolvedValue(source);
    const deps = createApplyDependencies(
      project,
      { path: "/target", backupRoot: "/backups", currentSource: "original" },
      { validateNative: async () => valid, confirm: async () => true },
      client,
    );
    expect(await applyProject(project, deps)).toMatchObject({
      status: "applied",
    });
    expect(client.createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ project }),
      20,
    );
    client.readTextFile.mockResolvedValue("wrong bytes");
    await expect(applyProject(project, deps)).rejects.toThrow(
      "verification failed",
    );
  });
});

test("native validation detects a binary, stages only the candidate and always cleans up", async () => {
  const project = makeProject({ name: "Native", terminal: "ghostty" });
  const cleanup = vi.fn(async () => {});
  const stage = vi.fn(async () => ({ path: "/tmp/candidate.conf", cleanup }));
  const validate = createNativeValidationDependency(stage);
  vi.mocked(invoke)
    .mockResolvedValueOnce([
      {
        terminal: "ghostty",
        binaryPath: "/usr/bin/ghostty",
        configPaths: [],
        version: null,
      },
    ])
    .mockResolvedValueOnce(valid);
  expect(await validate(project, "candidate")).toEqual(valid);
  expect(stage).toHaveBeenCalledWith("candidate", "ghostty");
  expect(invoke).toHaveBeenLastCalledWith("validate_candidate", {
    request: {
      terminal: "ghostty",
      binaryPath: "/usr/bin/ghostty",
      candidatePath: "/tmp/candidate.conf",
    },
  });
  expect(cleanup).toHaveBeenCalledOnce();
  vi.mocked(invoke)
    .mockResolvedValueOnce([
      { terminal: "ghostty", binaryPath: "/usr/bin/ghostty" },
    ])
    .mockRejectedValueOnce(new Error("timeout"));
  await expect(validate(project, "candidate")).rejects.toThrow("timeout");
  expect(cleanup).toHaveBeenCalledTimes(2);
});

test("missing native validators do not stage or launch a candidate", async () => {
  const project = makeProject({ name: "Native", terminal: "ghostty" });
  const stage = vi.fn(async () => ({
    path: "/tmp/candidate",
    cleanup: async () => {},
  }));
  vi.mocked(invoke).mockResolvedValueOnce([]);
  const result = await createNativeValidationDependency(stage)(
    project,
    "candidate",
  );
  expect(result).toMatchObject({
    valid: true,
    nativeAvailable: false,
    issues: [{ code: "NATIVE_VALIDATION_UNAVAILABLE" }],
  });
  expect(stage).not.toHaveBeenCalled();
});

test("concurrent applies cannot race to overwrite the same destination", async () => {
  const { project, deps } = setup();
  let finish: (confirmed: boolean) => void = () => {
    throw new Error("Confirmation not started");
  };
  deps.confirm.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const applying = applyProject(project, deps);
  await vi.waitFor(() => expect(deps.confirm).toHaveBeenCalledOnce());
  await expect(
    applyProject(makeProject({ name: "Other", terminal: "kitty" }), deps),
  ).rejects.toThrow("already running");
  finish(false);
  expect(await applying).toEqual({ status: "cancelled" });
  deps.confirm.mockResolvedValue(true);
  expect(await applyProject(project, deps)).toMatchObject({
    status: "applied",
  });
});
