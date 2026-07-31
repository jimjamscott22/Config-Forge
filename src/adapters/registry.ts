import type { TerminalId } from "../domain/shared-config";
import type { TerminalAdapter } from "./terminal-adapter";

const adapters = new Map<TerminalId, TerminalAdapter>();

export function registerAdapter(adapter: TerminalAdapter): void {
  adapters.set(adapter.terminal, adapter);
}

export function getAdapter(terminal: TerminalId): TerminalAdapter {
  const adapter = adapters.get(terminal);

  if (!adapter) {
    throw new Error(`No adapter registered for ${terminal}`);
  }

  return adapter;
}

export const adapterRegistry = {
  register: registerAdapter,
  get: getAdapter,
} as const;

export function clearAdaptersForTests(): void {
  adapters.clear();
}
