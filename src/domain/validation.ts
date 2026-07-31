export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  code: string;
  message: string;
  modelPath?: string;
  sourceLine?: number;
}

export interface ValidationResult {
  valid: boolean;
  nativeAvailable: boolean;
  issues: ValidationIssue[];
}
