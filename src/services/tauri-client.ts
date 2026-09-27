import { invoke } from "@tauri-apps/api/core";
import type { DetectedInstallation } from "../adapters/terminal-adapter";

export async function detectTerminals(): Promise<DetectedInstallation[]> {
  return invoke("detect_terminals");
}
