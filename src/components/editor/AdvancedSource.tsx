import { useEffect, useId, useMemo, useState } from "react";
import { getAdapter } from "../../adapters/registry";
import type { TerminalProject } from "../../domain/project";
import { DiffViewer } from "./DiffViewer";
import {
  reconcileSourceEdit,
  type SourceReconciliation,
} from "./source-reconcile";

const PARSE_DEBOUNCE_MS = 400;

interface Draft {
  text: string;
  /** Generated source the edit started from. */
  base: string;
}
interface Parsed {
  text: string;
  project: TerminalProject;
  result: SourceReconciliation;
}

export function AdvancedSource({
  project,
  disabled = false,
  onApply,
}: {
  project: TerminalProject;
  disabled?: boolean;
  onApply(project: TerminalProject): void;
}) {
  const id = useId();
  const generated = useMemo(
    () => getAdapter(project.terminal).generate(project).source,
    [project],
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(
      () =>
        setParsed({
          text: draft.text,
          project,
          result: reconcileSourceEdit(project, draft.text),
        }),
      PARSE_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [draft, project]);

  if (!draft) {
    return (
      <>
        <div className="workspace-heading">
          <h2>Generated source</h2>
          <span>Read only</span>
        </div>
        <pre className="config-source">
          {generated ||
            "# No settings yet. The terminal will use its defaults."}
        </pre>
        <div className="source-actions">
          <button
            className="button"
            type="button"
            disabled={disabled}
            onClick={() => {
              setParsed(null);
              setReviewed(false);
              setDraft({ text: generated, base: generated });
            }}
          >
            Edit source
          </button>
        </div>
      </>
    );
  }

  const changed = draft.text !== generated;
  const pending =
    !parsed || parsed.text !== draft.text || parsed.project !== project;
  const result = pending ? null : parsed.result;
  const stale = draft.base !== generated;
  const needsReview = Boolean(result?.requiresConfirmation) || stale;
  const canApply =
    !disabled &&
    changed &&
    result?.applicable === true &&
    (!needsReview || reviewed);
  const status = !changed
    ? "No changes"
    : pending
      ? "Unsaved edits · checking…"
      : result?.applicable
        ? "Unsaved edits · parsed"
        : "Unsaved edits · cannot apply";

  return (
    <>
      <div className="workspace-heading">
        <h2>Editing source</h2>
        <span role="status">{status}</span>
      </div>
      <label className="source-label" htmlFor={`${id}-editor`}>
        Native {project.terminal} config
      </label>
      <textarea
        id={`${id}-editor`}
        className="source-editor"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        rows={Math.min(24, Math.max(8, draft.text.split("\n").length + 1))}
        value={draft.text}
        disabled={disabled}
        aria-invalid={result?.applicable === false}
        onChange={(event) => {
          setReviewed(false);
          setDraft({ ...draft, text: event.target.value });
        }}
      />
      {stale ? (
        <p className="error-message" role="alert">
          Visual controls changed while you were editing. Applying this source
          replaces those changes.
        </p>
      ) : null}
      {result?.issues.length ? (
        <ul className="validation-list source-diagnostics">
          {result.issues.map((issue, index) => (
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
      ) : null}
      {result?.unmappedAdded.length ? (
        <p className="source-warning" role="alert">
          This edit adds {result.unmappedAdded.length} setting
          {result.unmappedAdded.length === 1 ? "" : "s"} the visual editor
          cannot map. They are preserved verbatim but stay read-only in the
          controls.
        </p>
      ) : null}
      {result?.unmappedRemoved.length ? (
        <p className="source-warning">
          This edit removes {result.unmappedRemoved.length} preserved line
          {result.unmappedRemoved.length === 1 ? "" : "s"}.
        </p>
      ) : null}
      {changed && result?.applicable ? (
        <DiffViewer
          current={generated}
          candidate={draft.text}
          currentLabel="Generated"
          candidateLabel="Edited"
          confirmation={
            needsReview
              ? {
                  label: "I reviewed this diff and want to apply the edit.",
                  checked: reviewed,
                  onChange: setReviewed,
                }
              : undefined
          }
        />
      ) : null}
      <div className="source-actions">
        <button
          className="button button-primary"
          type="button"
          disabled={!canApply}
          onClick={() => {
            if (!result?.applicable) return;
            onApply(result.project);
            setDraft(null);
            setParsed(null);
            setReviewed(false);
          }}
        >
          Apply source edit
        </button>
        <button
          className="button"
          type="button"
          onClick={() => {
            setDraft(null);
            setParsed(null);
            setReviewed(false);
          }}
        >
          Revert to Generated Source
        </button>
      </div>
    </>
  );
}
