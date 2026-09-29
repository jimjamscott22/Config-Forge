import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { getAdapter } from "../../adapters/registry";
import type { TerminalProject } from "../../domain/project";
import { validateProject } from "../../services/validation-service";

const query = "(max-width: 960px)";
function subscribeLayout(callback: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener("change", callback);
  return () => media?.removeEventListener("change", callback);
}
function narrowLayout() {
  return window.matchMedia?.(query).matches ?? false;
}
const tabs = ["controls", "preview", "source", "validation"] as const;
type StudioTab = (typeof tabs)[number];

export function SplitStudio({
  project,
  projects = [],
  busy = false,
  onOpen,
  onHome,
  controls,
  preview,
}: {
  project: TerminalProject;
  projects?: TerminalProject[];
  busy?: boolean;
  onOpen(id: string): void;
  onHome(): void;
  controls?: ReactNode;
  preview?: ReactNode;
}) {
  const narrow = useSyncExternalStore(
    subscribeLayout,
    narrowLayout,
    () => false,
  );
  const [active, setActive] = useState<StudioTab>("source");
  const id = useId();
  const tabButtons = useRef<
    Partial<Record<StudioTab, HTMLButtonElement | null>>
  >({});
  const visibleTabs: readonly StudioTab[] = narrow
    ? tabs
    : tabs.filter((tab) => tab !== "controls");
  const selected = !narrow && active === "controls" ? "source" : active;
  const generated = getAdapter(project.terminal).generate(project);
  const validation = validateProject(project);
  const issues = [...generated.issues, ...validation.issues];
  const controlsContent = controls ?? (
    <div className="settings-overview">
      <p className="eyebrow">Current settings</p>
      <h2>Config overview</h2>
      <dl>
        <div>
          <dt>Terminal</dt>
          <dd>{project.terminal}</dd>
        </div>
        <div>
          <dt>Font</dt>
          <dd>{project.shared.font.family ?? "Terminal default"}</dd>
        </div>
        <div>
          <dt>Font size</dt>
          <dd>{project.shared.font.size ?? "Terminal default"}</dd>
        </div>
        <div>
          <dt>Opacity</dt>
          <dd>{project.shared.window.opacity ?? "Terminal default"}</dd>
        </div>
        <div>
          <dt>Preserved lines</dt>
          <dd>{project.document.length}</dd>
        </div>
      </dl>
      <p className="muted">
        Visual controls are coming next. Your source and validation results are
        ready to inspect.
      </p>
    </div>
  );
  function keydown(event: KeyboardEvent<HTMLButtonElement>, tab: StudioTab) {
    const index = visibleTabs.indexOf(tab);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? visibleTabs.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % visibleTabs.length
            : event.key === "ArrowLeft"
              ? (index - 1 + visibleTabs.length) % visibleTabs.length
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = visibleTabs[nextIndex];
    if (next) {
      setActive(next);
      tabButtons.current[next]?.focus();
    }
  }
  return (
    <section className="studio-view" aria-labelledby="view-title">
      <header className="studio-header">
        <div>
          <p className="eyebrow">{project.terminal} / workspace</p>
          <h1 id="view-title" tabIndex={-1}>
            {project.name}
          </h1>
        </div>
        <span className="draft-badge">Session draft</span>
      </header>
      <div className="studio-grid">
        <aside
          className="panel project-sidebar"
          aria-label="Project navigation"
        >
          <h2>Projects</h2>
          <button
            className="project-card current-project"
            type="button"
            aria-current="page"
            disabled
          >
            {project.name}
            <span>{project.terminal}</span>
          </button>
          <ul className="project-list">
            {projects
              .filter((item) => item.id !== project.id)
              .map((item) => (
                <li key={item.id}>
                  <button
                    className="project-card"
                    type="button"
                    disabled={busy}
                    onClick={() => onOpen(item.id)}
                  >
                    {item.name}
                    <span>{item.terminal}</span>
                  </button>
                </li>
              ))}
          </ul>
          <button className="button" type="button" onClick={onHome}>
            Back to workbench
          </button>
        </aside>
        {!narrow ? (
          <section
            className="panel studio-controls"
            aria-label="Visual controls"
          >
            {controlsContent}
          </section>
        ) : null}
        <section
          className="panel studio-workspace"
          aria-label="Configuration workspace"
        >
          <div
            className="studio-tabs"
            role="tablist"
            aria-label="Workspace views"
          >
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${id}-${tab}-tab`}
                aria-controls={`${id}-${tab}-panel`}
                aria-selected={selected === tab}
                tabIndex={selected === tab ? 0 : -1}
                ref={(element) => {
                  tabButtons.current[tab] = element;
                }}
                onClick={() => setActive(tab)}
                onKeyDown={(event) => keydown(event, tab)}
              >
                {tab === "validation"
                  ? `Validation${issues.length ? ` (${issues.length})` : ""}`
                  : tab[0]?.toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          {narrow ? (
            <div
              role="tabpanel"
              id={`${id}-controls-panel`}
              aria-labelledby={`${id}-controls-tab`}
              hidden={selected !== "controls"}
              tabIndex={0}
            >
              {controlsContent}
            </div>
          ) : null}
          <div
            role="tabpanel"
            id={`${id}-preview-panel`}
            aria-labelledby={`${id}-preview-tab`}
            hidden={selected !== "preview"}
            tabIndex={0}
          >
            {preview ?? (
              <div className="workspace-placeholder">
                <span className="preview-mark" aria-hidden="true">
                  &gt;_
                </span>
                <h2>A window into your terminal.</h2>
                <p>
                  The visual preview is coming with the controls. Switch to
                  Source to inspect the generated config.
                </p>
              </div>
            )}
          </div>
          <div
            role="tabpanel"
            id={`${id}-source-panel`}
            aria-labelledby={`${id}-source-tab`}
            hidden={selected !== "source"}
            tabIndex={0}
          >
            <div className="workspace-heading">
              <h2>Generated source</h2>
              <span>Read only</span>
            </div>
            <pre className="config-source">
              {generated.source ||
                "# No settings yet. The terminal will use its defaults."}
            </pre>
          </div>
          <div
            role="tabpanel"
            id={`${id}-validation-panel`}
            aria-labelledby={`${id}-validation-tab`}
            hidden={selected !== "validation"}
            tabIndex={0}
          >
            <div className="workspace-heading">
              <h2>Validation</h2>
              <span>
                {issues.some((issue) => issue.severity === "error")
                  ? "Needs attention"
                  : "No blocking issues"}
              </span>
            </div>
            {issues.length ? (
              <ul className="validation-list">
                {issues.map((issue, index) => (
                  <li
                    key={`${issue.id}-${index}`}
                    className={`issue-${issue.severity}`}
                  >
                    <strong>
                      {issue.severity}
                      {issue.sourceLine ? ` · line ${issue.sourceLine}` : ""}
                    </strong>
                    <p>{issue.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <strong>Internal checks passed.</strong>
                <p>Native validation runs before applying a config.</p>
              </div>
            )}
          </div>
        </section>
      </div>
      <footer className="studio-actions">
        <p>Session draft · Saving and applying are not available yet.</p>
        <div>
          <button className="button" type="button" disabled>
            Save project
          </button>
          <button className="button button-primary" type="button" disabled>
            Apply config
          </button>
        </div>
      </footer>
    </section>
  );
}
