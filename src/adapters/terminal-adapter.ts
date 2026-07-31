import type { DocumentNode } from "../domain/document-node";
import type { TerminalProject } from "../domain/project";
import type { SharedConfig, TerminalId } from "../domain/shared-config";
import type { ValidationResult } from "../domain/validation";

export interface ParseResult<TOverrides> {
  shared: SharedConfig;
  overrides: TOverrides;
  document: DocumentNode[];
  unmappedNodeIds: string[];
  issues: ValidationResult["issues"];
}

export interface GenerateResult {
  source: string;
  changedNodeIds: string[];
  issues: ValidationResult["issues"];
}

export interface PortableExtraction {
  shared: SharedConfig;
  omitted: Array<{
    key: string;
    reason: "terminal-specific" | "unsupported" | "invalid";
  }>;
}

export interface DetectedInstallation {
  terminal: TerminalId;
  binaryPath: string | null;
  configPaths: string[];
  version: string | null;
}

export interface NativeValidationRequest {
  terminal: TerminalId;
  binaryPath: string;
  candidatePath: string;
}

export interface TerminalAdapter<TOverrides = Record<string, unknown>> {
  readonly terminal: TerminalId;
  parse(source: string): ParseResult<TOverrides>;
  generate(project: TerminalProject): GenerateResult;
  validateInternal(project: TerminalProject): ValidationResult;
  extractPortable(project: TerminalProject): PortableExtraction;
  createOverrides(): TOverrides;
}
