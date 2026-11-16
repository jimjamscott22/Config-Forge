import type { ReactNode } from "react";
import type { TerminalProject } from "../../domain/project";
import type { ProjectSnapshot } from "../../domain/snapshot";
import type { StudioWorkflows } from "../../services/studio-workflows";
import { ApplyPanel } from "./ApplyPanel";
import { ExportPanel } from "./ExportPanel";
import { HistoryPanel } from "./HistoryPanel";
import { TranslatePanel } from "./TranslatePanel";

export interface ProjectActionsProps {
  project: TerminalProject;
  workflows: StudioWorkflows;
  snapshots: ProjectSnapshot[];
  /** Saved and unchanged: operations that snapshot the project may run. */
  ready: boolean;
  destinationSuggestions: string[];
  onApplied(destination: string): Promise<void>;
  onSnapshotsChanged(): Promise<void>;
  onRestored(project: TerminalProject): Promise<void>;
  onProjectsChanged(): void;
  onOpenProject(id: string): void;
}

export type ProjectActionTab = "write" | "export" | "translate" | "history";

/** The workflow panels, one per Studio side-panel tab. */
export function projectActionPanels({
  project,
  workflows,
  snapshots,
  ready,
  destinationSuggestions,
  onApplied,
  onSnapshotsChanged,
  onRestored,
  onProjectsChanged,
  onOpenProject,
}: ProjectActionsProps): Record<ProjectActionTab, ReactNode> {
  return {
    write: (
      <ApplyPanel
        key={`apply-${project.id}`}
        project={project}
        workflows={workflows}
        suggestions={destinationSuggestions}
        ready={ready}
        onApplied={onApplied}
      />
    ),
    export: (
      <ExportPanel
        key={`export-${project.id}`}
        project={project}
        workflows={workflows}
      />
    ),
    translate: (
      <TranslatePanel
        key={`translate-${project.id}`}
        project={project}
        workflows={workflows}
        ready={ready}
        onTranslated={onProjectsChanged}
        onOpen={onOpenProject}
      />
    ),
    history: (
      <HistoryPanel
        key={`history-${project.id}`}
        project={project}
        workflows={workflows}
        snapshots={snapshots}
        ready={ready}
        onChanged={onSnapshotsChanged}
        onRestored={onRestored}
      />
    ),
  };
}
