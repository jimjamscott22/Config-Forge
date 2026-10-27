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

export function ProjectActions({
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
}: ProjectActionsProps) {
  return (
    <section
      id="project-actions"
      className="panel project-actions"
      aria-label="Project actions"
    >
      <ApplyPanel
        key={`apply-${project.id}`}
        project={project}
        workflows={workflows}
        suggestions={destinationSuggestions}
        ready={ready}
        onApplied={onApplied}
      />
      <ExportPanel
        key={`export-${project.id}`}
        project={project}
        workflows={workflows}
      />
      <TranslatePanel
        key={`translate-${project.id}`}
        project={project}
        workflows={workflows}
        ready={ready}
        onTranslated={onProjectsChanged}
        onOpen={onOpenProject}
      />
      <HistoryPanel
        key={`history-${project.id}`}
        project={project}
        workflows={workflows}
        snapshots={snapshots}
        ready={ready}
        onChanged={onSnapshotsChanged}
        onRestored={onRestored}
      />
    </section>
  );
}
