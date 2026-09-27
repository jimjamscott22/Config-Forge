import type { TerminalId } from "./shared-config";

export type TranslationStatus =
  "exact" | "approximate" | "omitted" | "defaulted";

export interface TranslationReportItem {
  modelPath: string;
  status: TranslationStatus;
  sourceValue: unknown;
  destinationValue: unknown;
  explanation: string;
}

export interface TranslationReport {
  sourceTerminal: TerminalId;
  destinationTerminal: TerminalId;
  items: TranslationReportItem[];
}
