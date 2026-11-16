import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { getAdapter } from "../../adapters/registry";
import type { TerminalProject } from "../../domain/project";
import type { SharedConfig } from "../../domain/shared-config";
import { validateProject } from "../../services/validation-service";
import { AdvancedSource } from "../editor/AdvancedSource";
import { changedFields } from "../editor/control-fields";
import { VisualControls } from "../editor/VisualControls";
import { TerminalPreview } from "../preview/TerminalPreview";
import { ValidationPanel } from "../validation/ValidationPanel";
import type { ProjectActionTab } from "../workflows/ProjectActions";
import { ProjectSwitcher } from "./ProjectSwitcher";
import {
  StudioSidePanel,
  type SidePanelSection,
  type SidePanelTab,
} from "./StudioSidePanel";

const actionLabels: Record<ProjectActionTab, string> = {
  write: "Write",
  export: "Export",
  translate: "Translate",
  history: "History",
};

export function SplitStudio({
  project,
  baseline,
  projects = [],
  busy = false,
  onOpen,
  onHome,
  controls,
  preview,
  onSharedChange,
  onProjectChange,
  onSaveAsTemplate,
  persistence,
  actions,
}: {
  project: TerminalProject;
  /** The project as last saved; drives per-field change markers. */
  baseline?: TerminalProject | null;
  projects?: TerminalProject[];
  busy?: boolean;
  onOpen(id: string): void;
  onHome(): void;
  controls?: ReactNode;
  preview?: ReactNode;
  onSharedChange?(shared: SharedConfig): void;
  onProjectChange?(project: TerminalProject): void;
  onSaveAsTemplate?(project: TerminalProject): void;
  /** Present once desktop persistence is wired; otherwise the project is a session draft. */
  persistence?: { persisted: boolean; dirty: boolean; onSave(): void };
  /** Write / export / translate / history panels, shown as side-panel tabs. */
  actions?: Partial<Record<ProjectActionTab, ReactNode>>;
}) {
  const id = useId();
  const [panel, setPanel] = useState<{ open: boolean; tab: SidePanelTab }>({
    open: false,
    tab: "source",
  });
  const opener = useRef<HTMLElement | null>(null);
  const generated = useMemo(
    () => getAdapter(project.terminal).generate(project),
    [project],
  );
  const validation = useMemo(() => validateProject(project), [project]);
  const issues = useMemo(
    () => [...generated.issues, ...validation.issues],
    [generated.issues, validation.issues],
  );
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const sameBaseline = baseline?.id === project.id ? baseline : null;
  const changed = useMemo(
    () => changedFields(project.shared, sameBaseline?.shared).length,
    [project.shared, sameBaseline],
  );

  const status = !persistence
    ? { text: "Session draft", unwritten: false }
    : changed > 0
      ? { text: `${changed} changed`, unwritten: true }
      : !persistence.persisted
        ? { text: "Not saved yet", unwritten: true }
        : persistence.dirty
          ? { text: "Unsaved changes", unwritten: true }
          : { text: "Saved", unwritten: false };
  const persistenceNote = persistence
    ? "Projects are stored locally on this computer."
    : "Session draft · Saving and applying need the desktop app.";

  const controlsContent = controls ?? (
    <VisualControls
      key={project.id}
      project={project}
      baseline={sameBaseline?.shared}
      disabled={busy || !onSharedChange}
      onChange={(shared) => onSharedChange?.(shared)}
    />
  );

  const sections: SidePanelSection[] = [
    {
      id: "source",
      label: "Source",
      content: (
        <AdvancedSource
          key={project.id}
          project={project}
          generatedSource={generated.source}
          disabled={busy || !onProjectChange}
          onApply={(next) => onProjectChange?.(next)}
        />
      ),
    },
    {
      id: "validation",
      label: issues.length ? `Validation (${issues.length})` : "Validation",
      content: <ValidationPanel issues={issues} />,
    },
    ...(Object.keys(actionLabels) as ProjectActionTab[]).flatMap((tab) =>
      actions?.[tab]
        ? [{ id: tab, label: actionLabels[tab], content: actions[tab] }]
        : [],
    ),
  ];

  function openPanel(tab: SidePanelTab, from: HTMLElement) {
    opener.current = from;
    setPanel({ open: true, tab });
  }
  function closePanel() {
    setPanel((current) => ({ ...current, open: false }));
    opener.current?.focus();
  }

  return (
    <section
      className={`studio-view${panel.open ? " side-panel-open" : ""}`}
      aria-labelledby="view-title"
    >
      <h1 id="view-title" className="visually-hidden" tabIndex={-1}>
        {project.name}
      </h1>
      <header className="studio-topbar">
        <div className="studio-topbar-project">
          <ProjectSwitcher
            current={project}
            projects={
              projects.some((item) => item.id === project.id)
                ? projects
                : [project, ...projects]
            }
            busy={busy}
            onOpen={onOpen}
            onHome={onHome}
            onSaveAsTemplate={onSaveAsTemplate}
          />
          <span
            className={`draft-badge${status.unwritten ? " unwritten" : ""}`}
            role="status"
            aria-describedby={`${id}-persistence`}
          >
            {status.text}
          </span>
          <span id={`${id}-persistence`} className="visually-hidden">
            {persistenceNote}
          </span>
        </div>
        <div className="studio-topbar-actions">
          <button
            className="button"
            type="button"
            aria-pressed={panel.open && panel.tab === "source"}
            onClick={(event) => openPanel("source", event.currentTarget)}
          >
            Source
          </button>
          <button
            className={`button validation-button ${
              errors ? "has-errors" : warnings ? "has-warnings" : "is-valid"
            }`}
            type="button"
            aria-label={`Validation: ${errors} errors, ${warnings} warnings`}
            onClick={(event) => openPanel("validation", event.currentTarget)}
          >
            {errors ? `✕ ${errors}` : warnings ? `⚠ ${warnings}` : "✓ valid"}
          </button>
          <button
            className="button"
            type="button"
            disabled={
              !persistence ||
              busy ||
              (persistence.persisted && !persistence.dirty)
            }
            onClick={() => persistence?.onSave()}
          >
            Save project
          </button>
          <button
            className="button button-write"
            type="button"
            disabled={!actions?.write}
            onClick={(event) => openPanel("write", event.currentTarget)}
          >
            Write to disk
          </button>
        </div>
      </header>
      <div className="studio-stage">
        <section className="studio-preview" aria-label="Live preview">
          {preview ?? (
            <TerminalPreview
              shared={project.shared}
              terminal={project.terminal}
            />
          )}
        </section>
        <aside className="panel studio-controls" aria-label="Visual controls">
          {controlsContent}
        </aside>
      </div>
      <StudioSidePanel
        open={panel.open}
        active={panel.tab}
        sections={sections}
        note={persistenceNote}
        onSelect={(tab) => setPanel({ open: true, tab })}
        onClose={closePanel}
      />
    </section>
  );
}
