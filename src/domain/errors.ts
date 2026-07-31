export type AppErrorCode =
  | "CFG_PARSE_ERROR"
  | "CFG_UNSUPPORTED_SYNTAX"
  | "PATH_NOT_FOUND"
  | "PATH_PERMISSION_DENIED"
  | "TARGET_IS_SYMLINK"
  | "BACKUP_FAILED"
  | "ATOMIC_WRITE_FAILED"
  | "READBACK_MISMATCH"
  | "NATIVE_VALIDATION_UNAVAILABLE"
  | "NATIVE_VALIDATION_FAILED"
  | "DATABASE_MIGRATION_FAILED";

export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: string;
  recoverable: boolean;
  suggestedAction?: string;
}
