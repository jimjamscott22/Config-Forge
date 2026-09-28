import { createTwoFilesPatch } from "diff";
import { getAdapter } from "../adapters/registry";
import type { TerminalId } from "../domain/shared-config";
import type { TerminalProject } from "../domain/project";
import type { ValidationIssue, ValidationResult } from "../domain/validation";
import { createSnapshot } from "./project-service";
import {
  detectTerminals,
  validateCandidate,
  projectClient,
  type ProjectClient,
  type BackupRecord,
  type WriteReceipt,
} from "./tauri-client";
import { validateProject } from "./validation-service";

export interface ApplyTarget {
  path: string;
  currentSource: string | null;
  backupRoot: string;
}
export interface BackupRequest {
  target: string;
  backupRoot: string;
}
export interface AtomicWriteRequest {
  target: string;
  candidate: string;
  expectedSource: string | null;
}
export interface VerifyRequest {
  target: string;
  candidate: string;
  receipt: WriteReceipt;
}
export interface ApplyConfirmation {
  project: TerminalProject;
  target: string;
  candidate: string;
  diff: string;
  issues: ValidationIssue[];
}
export interface ApplyDependencies {
  target: ApplyTarget;
  generate(project: TerminalProject): Promise<string>;
  validateInternal(project: TerminalProject): Promise<ValidationResult>;
  validateNative(
    project: TerminalProject,
    candidate: string,
  ): Promise<ValidationResult>;
  createDiff(current: string, candidate: string): Promise<string>;
  confirm(request: ApplyConfirmation): Promise<boolean>;
  createSnapshot(
    projectId: string,
    kind: "automatic",
    reason: "before-direct-apply",
  ): Promise<void>;
  createBackup(request: BackupRequest): Promise<BackupRecord>;
  atomicWrite(request: AtomicWriteRequest): Promise<WriteReceipt>;
  verify(request: VerifyRequest): Promise<void>;
}
export type ApplyResult =
  | { status: "cancelled" }
  | { status: "blocked"; issues: ValidationIssue[] }
  | { status: "applied"; backup: BackupRecord | null; receipt: WriteReceipt };

const applyingProjects = new Set<string>();
const applyingTargets = new Set<string>();

export async function applyProject(
  project: TerminalProject,
  deps: ApplyDependencies,
): Promise<ApplyResult> {
  const target = { ...deps.target };
  const projectId = project.id;
  if (applyingProjects.has(projectId) || applyingTargets.has(target.path)) {
    throw new Error(
      "An apply is already running for this project or destination.",
    );
  }
  applyingProjects.add(projectId);
  applyingTargets.add(target.path);
  try {
    return await runApply(project, { ...deps, target });
  } finally {
    applyingProjects.delete(projectId);
    applyingTargets.delete(target.path);
  }
}

async function runApply(
  project: TerminalProject,
  deps: ApplyDependencies,
): Promise<ApplyResult> {
  // Freeze the content and target reviewed by the user, including across awaited confirmation.
  const draft = structuredClone(project);
  const target = { ...deps.target };
  if (!target.path || !target.backupRoot)
    throw new Error("Apply requires a target path and backup directory.");
  const candidate = await deps.generate(draft);
  const internal = await deps.validateInternal(draft);
  if (
    !internal.valid ||
    internal.issues.some((issue) => issue.severity === "error")
  )
    return { status: "blocked", issues: internal.issues };
  const native = await deps.validateNative(draft, candidate);
  const issues = [...internal.issues, ...native.issues];
  if (!native.valid || issues.some((issue) => issue.severity === "error"))
    return { status: "blocked", issues };
  const diff = await deps.createDiff(target.currentSource ?? "", candidate);
  if (
    !(await deps.confirm({
      project: structuredClone(draft),
      target: target.path,
      candidate,
      diff,
      issues,
    }))
  )
    return { status: "cancelled" };
  await deps.createSnapshot(draft.id, "automatic", "before-direct-apply");
  const backup =
    target.currentSource === null
      ? null
      : await deps.createBackup({
          target: target.path,
          backupRoot: target.backupRoot,
        });
  const receipt = await deps.atomicWrite({
    target: target.path,
    candidate,
    expectedSource: target.currentSource,
  });
  await deps.verify({ target: target.path, candidate, receipt });
  return { status: "applied", backup, receipt };
}

export function createApplyDependencies(
  project: TerminalProject,
  target: ApplyTarget,
  interactions: Pick<ApplyDependencies, "validateNative" | "confirm">,
  client: ProjectClient = projectClient,
): ApplyDependencies {
  const projectId = project.id;
  let snapshotProject = structuredClone(project);
  const diffPath = target.path;
  return {
    target,
    generate: async (project) => {
      if (project.id !== projectId)
        throw new Error("Apply dependencies belong to another project.");
      snapshotProject = structuredClone(project);
      const generated = getAdapter(project.terminal).generate(project);
      if (generated.issues.some((issue) => issue.severity === "error"))
        throw new Error("Config generation failed.");
      return generated.source;
    },
    validateInternal: async (project) => validateProject(project),
    validateNative: interactions.validateNative,
    createDiff: async (current, candidate) =>
      createTwoFilesPatch(diffPath, diffPath, current, candidate),
    confirm: interactions.confirm,
    createSnapshot: async () => {
      await createSnapshot(
        snapshotProject,
        { kind: "automatic", reason: "before-direct-apply" },
        client,
      );
    },
    createBackup: (request) => client.createBackup(request),
    atomicWrite: (request) => client.applyConfig(request),
    verify: async (request) => {
      const actual = await client.readTextFile(request.target);
      if (
        actual !== request.candidate ||
        new TextEncoder().encode(actual).length !== request.receipt.bytesWritten
      ) {
        throw new Error(`Read-back verification failed: ${request.target}`);
      }
    },
  };
}

export interface StagedCandidate {
  path: string;
  cleanup(): Promise<void>;
}

/** Desktop wiring supplies temporary-file staging; editor text never chooses an executable. */
export function createNativeValidationDependency(
  stageCandidate: (
    candidate: string,
    terminal: TerminalId,
  ) => Promise<StagedCandidate>,
): ApplyDependencies["validateNative"] {
  return async (project, candidate) => {
    const installation = (await detectTerminals()).find(
      (item) => item.terminal === project.terminal,
    );
    if (!installation?.binaryPath) {
      return {
        valid: true,
        nativeAvailable: false,
        issues: [
          {
            id: "native:unavailable",
            severity: "info",
            code: "NATIVE_VALIDATION_UNAVAILABLE",
            message: `No native validator is installed for ${project.terminal}.`,
          },
        ],
      };
    }
    const staged = await stageCandidate(candidate, project.terminal);
    try {
      return await validateCandidate({
        terminal: project.terminal,
        binaryPath: installation.binaryPath,
        candidatePath: staged.path,
      });
    } finally {
      await staged.cleanup();
    }
  };
}
