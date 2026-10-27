import { useId, useState } from "react";
import type { TerminalProject } from "../../domain/project";
import { terminalIdSchema, type TerminalId } from "../../domain/shared-config";
import type { TranslationReport } from "../../domain/translation";
import type { StudioWorkflows } from "../../services/studio-workflows";
import { TranslationReportView } from "./TranslationReportView";

const terminals = terminalIdSchema.options;

export function TranslatePanel({
  project,
  workflows,
  ready,
  onTranslated,
  onOpen,
}: {
  project: TerminalProject;
  workflows: StudioWorkflows;
  ready: boolean;
  onTranslated(): void;
  onOpen(id: string): void;
}) {
  const id = useId();
  const targets = terminals.filter((terminal) => terminal !== project.terminal);
  const [terminal, setTerminal] = useState<TerminalId>(
    targets[0] ?? project.terminal,
  );
  const [name, setName] = useState(`${project.name} (${targets[0]})`);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{
    project: TerminalProject;
    report: TranslationReport;
  } | null>(null);

  async function run() {
    setError(null);
    setOutcome(null);
    setWorking(true);
    try {
      const translated = await workflows.translate(
        project,
        terminal,
        name.trim(),
      );
      setOutcome(translated);
      onTranslated();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="workflow-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Translate to another terminal</h2>
      <p className="muted">
        Creates a new project from the portable settings. This project is not
        changed.
      </p>
      {!ready ? (
        <p role="status">Save the project before translating it.</p>
      ) : null}
      <div className="workflow-field">
        <label htmlFor={`${id}-terminal`}>Translate to</label>
        <select
          id={`${id}-terminal`}
          value={terminal}
          disabled={!ready || working}
          onChange={(event) => {
            const next = terminalIdSchema.parse(event.target.value);
            setTerminal(next);
            setName(`${project.name} (${next})`);
          }}
        >
          {targets.map((target) => (
            <option key={target} value={target}>
              {target}
            </option>
          ))}
        </select>
      </div>
      <label className="workflow-field" htmlFor={`${id}-name`}>
        New project name
        <input
          id={`${id}-name`}
          value={name}
          disabled={!ready || working}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="form-actions">
        <button
          className="button"
          type="button"
          disabled={!ready || working || !name.trim()}
          onClick={() => void run()}
        >
          Translate to new project
        </button>
      </div>
      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      {outcome ? (
        <>
          <TranslationReportView report={outcome.report} />
          <button
            className="button"
            type="button"
            onClick={() => onOpen(outcome.project.id)}
          >
            Open “{outcome.project.name}”
          </button>
        </>
      ) : null}
    </section>
  );
}
