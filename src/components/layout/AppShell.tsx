import type { ReactNode } from "react";

export function AppShell({
  children,
  onHome,
}: {
  children: ReactNode;
  onHome(): void;
}) {
  return (
    <main className="app-shell">
      <a className="skip-link" href="#view-title">
        Skip to workspace
      </a>
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={onHome}
          aria-label="Config Forge home"
        >
          <span className="brand-mark" aria-hidden="true">
            CF
          </span>
          <span>Config Forge</span>
        </button>
        <p className="local-status">
          <span aria-hidden="true" />
          Local-only workspace
        </p>
      </header>
      {children}
    </main>
  );
}
