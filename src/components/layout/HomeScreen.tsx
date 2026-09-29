import type { DetectedInstallation } from "../../adapters/terminal-adapter";
import type { TerminalProject } from "../../domain/project";
import type { TerminalId } from "../../domain/shared-config";
import type { ConfigTemplate } from "../../domain/template";

const terminals = [
  { id: "ghostty", name: "Ghostty", format: "key/value" },
  { id: "kitty", name: "Kitty", format: "directives" },
  { id: "alacritty", name: "Alacritty", format: "TOML" },
] as const;
const emptyProjects: TerminalProject[] = [];
const emptyInstallations: DetectedInstallation[] = [];
const emptyTemplates: ConfigTemplate[] = [];

export interface HomeScreenProps {
  projects?: TerminalProject[];
  current?: TerminalProject | null;
  installations?: DetectedInstallation[];
  detectionStatus?: "unavailable" | "loading" | "ready" | "failed";
  templates?: ConfigTemplate[];
  busy?: boolean;
  onCreate?(terminal?: TerminalId): void;
  onImport?(): void;
  onOpen?(id: string): void;
  onResume?(): void;
  onTemplate?(template: ConfigTemplate): void;
}

export function HomeScreen({
  projects = emptyProjects,
  current = null,
  installations = emptyInstallations,
  detectionStatus = "unavailable",
  templates = emptyTemplates,
  busy = false,
  onCreate,
  onImport,
  onOpen,
  onResume,
  onTemplate,
}: HomeScreenProps) {
  return (
    <section className="home-view" aria-labelledby="view-title">
      <div className="welcome-copy">
        <p className="eyebrow">Terminal configuration studio</p>
        <h1 id="view-title" tabIndex={-1}>
          Config Forge
        </h1>
        <p className="lede">
          Shape your terminal, keep the source legible, and make every change
          with a clear path back.
        </p>
      </div>
      <div className="home-grid">
        <div className="home-main">
          <div className="entry-actions">
            <button
              className="action-card"
              type="button"
              aria-label="Create New Config"
              onClick={() => onCreate?.()}
              disabled={busy}
            >
              <span className="card-index" aria-hidden="true">
                01 / START FRESH
              </span>
              <strong>Create New Config</strong>
              <span>Start an empty Ghostty, Kitty, or Alacritty draft.</span>
              <span className="card-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
            <button
              className="action-card"
              aria-label="Import Existing Config"
              type="button"
              onClick={onImport}
              disabled={busy}
            >
              <span className="card-index" aria-hidden="true">
                02 / BRING YOUR OWN
              </span>
              <strong>Import Existing Config</strong>
              <span>
                Keep your comments, custom settings, and original file.
              </span>
              <span className="card-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          </div>
          {current ? (
            <section
              className="panel draft-summary"
              aria-labelledby="draft-title"
            >
              <div>
                <p className="eyebrow">Current workspace</p>
                <h2 id="draft-title">{current.name}</h2>
                <p>{current.terminal} · Kept in this session</p>
              </div>
              <button
                className="button"
                type="button"
                onClick={onResume}
                disabled={busy}
              >
                Resume draft
              </button>
            </section>
          ) : null}
          <section className="panel" aria-labelledby="recent-title">
            <div className="panel-heading">
              <h2 id="recent-title">Recent projects</h2>
              <span>{projects.length} saved</span>
            </div>
            {projects.length ? (
              <ul className="project-list">
                {projects.map((project) => (
                  <li key={project.id}>
                    <button
                      className="project-card"
                      type="button"
                      onClick={() => onOpen?.(project.id)}
                      disabled={busy}
                    >
                      <strong>{project.name}</strong>
                      <span>{project.terminal}</span>
                      <span>
                        {project.destinationPath ??
                          project.sourcePath ??
                          "No target selected"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <strong>A clean workbench.</strong>
                <p>
                  Your saved projects will appear here. Create or import a draft
                  to get started.
                </p>
              </div>
            )}
          </section>
          <section className="panel" aria-labelledby="templates-title">
            <div className="panel-heading">
              <h2 id="templates-title">Built-in templates</h2>
              <span>Starting points</span>
            </div>
            {templates.length ? (
              <ul className="project-list">
                {templates.map((template) => (
                  <li key={template.id}>
                    <button
                      className="project-card"
                      type="button"
                      onClick={() => onTemplate?.(template)}
                      disabled={busy}
                    >
                      <strong>{template.name}</strong>
                      <span>{template.terminal}</span>
                      <span>{template.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <strong>Room for your next starting point.</strong>
                <p>
                  The starter collection is coming soon. For now, begin with a
                  blank config or one of your own.
                </p>
              </div>
            )}
          </section>
        </div>
        <aside className="terminal-panel" aria-labelledby="terminals-title">
          <div className="panel-heading">
            <h2 id="terminals-title">Detected terminals</h2>
            <span>3 formats</span>
          </div>
          <ul className="terminal-list">
            {terminals.map((terminal, index) => {
              const installation = installations.find(
                (item) => item.terminal === terminal.id,
              );
              const status =
                detectionStatus !== "ready"
                  ? "Not checked"
                  : installation?.binaryPath
                    ? "Installed"
                    : installation?.configPaths.length
                      ? "Config found"
                      : "Not found";
              return (
                <li key={terminal.id}>
                  <span className="terminal-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <button
                    className="terminal-choice"
                    type="button"
                    onClick={() => onCreate?.(terminal.id)}
                    disabled={busy}
                    aria-label={`Create a ${terminal.name} config`}
                  >
                    <strong>{terminal.name}</strong>
                    <span>{terminal.format}</span>
                  </button>
                  <span className="terminal-state">{status}</span>
                </li>
              );
            })}
          </ul>
          <p className="detection-note" role="status">
            {detectionStatus === "loading"
              ? "Checking your terminals…"
              : detectionStatus === "failed"
                ? "Terminal detection failed. You can still start a draft."
                : detectionStatus === "unavailable"
                  ? "Open the desktop app to detect installed terminals. You can draft for any format here."
                  : "Choose a terminal to start a config."}
          </p>
          <p className="safety-line">Preview, validate, back up, then write.</p>
        </aside>
      </div>
    </section>
  );
}
