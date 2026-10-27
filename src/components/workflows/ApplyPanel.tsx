import { useEffect, useId, useRef, useState } from "react";
import type { TerminalProject } from "../../domain/project";
import type { ValidationIssue } from "../../domain/validation";
import type {
  ApplyConfirmation,
  ApplyResult,
} from "../../services/apply-service";
import {
  describeDestination,
  type StudioWorkflows,
} from "../../services/studio-workflows";
import { DiffViewer, type DiffTarget } from "../editor/DiffViewer";

interface Review {
  request: ApplyConfirmation;
  target: DiffTarget;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function ApplyPanel({
  project,
  workflows,
  suggestions,
  ready,
  onApplied,
}: {
  project: TerminalProject;
  workflows: StudioWorkflows;
  suggestions: string[];
  /** The project is saved and unchanged, so the pre-apply snapshot can reference it. */
  ready: boolean;
  onApplied(destination: string): Promise<void>;
}) {
  const id = useId();
  const [destination, setDestination] = useState(
    project.destinationPath ?? suggestions[0] ?? "",
  );
  const [working, setWorking] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    | { status: "applied"; message: string }
    | { status: "cancelled" }
    | { status: "blocked"; issues: ValidationIssue[] }
    | null
  >(null);
  const decision = useRef<((confirmed: boolean) => void) | null>(null);

  useEffect(
    () => () => {
      decision.current?.(false);
    },
    [],
  );

  function settle(confirmed: boolean) {
    decision.current?.(confirmed);
    decision.current = null;
    setReview(null);
    setReviewed(false);
  }

  async function start() {
    setError(null);
    setResult(null);
    const path = destination.trim();
    if (!path.startsWith("/")) {
      setError("Enter the absolute path of the config file to write.");
      return;
    }
    setWorking(true);
    try {
      const info = await describeDestination(workflows, project, path);
      if (info.isSymlink) {
        throw new Error(
          `${path} is a symbolic link. Config Forge refuses to write through symlinks; choose the real file path.`,
        );
      }
      const outcome: ApplyResult = await workflows.apply(
        project,
        path,
        (request) =>
          new Promise<boolean>((resolve) => {
            decision.current = resolve;
            setReview({
              request,
              target: {
                path,
                isSymlink: info.isSymlink,
                backupDestination: info.backupDestination,
              },
            });
          }),
      );
      if (outcome.status === "applied") {
        const backup = outcome.backup
          ? `Backup: ${outcome.backup.path}.`
          : "No backup was needed; the destination was new.";
        setResult({
          status: "applied",
          message: `Applied to ${path} (${outcome.receipt.bytesWritten} bytes, sha256 ${outcome.receipt.sha256}). ${backup}`,
        });
        await onApplied(path);
      } else {
        setResult(outcome);
      }
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      decision.current = null;
      setReview(null);
      setReviewed(false);
      setWorking(false);
    }
  }

  return (
    <section className="workflow-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Apply to a config file</h2>
      <p className="muted">
        Validates the config, shows a diff for your approval, snapshots the
        project, backs up the existing file, writes atomically, and reads the
        result back.
      </p>
      {!ready ? (
        <p role="status">Save the project before applying it.</p>
      ) : null}
      <label className="workflow-field" htmlFor={`${id}-destination`}>
        Destination path
        <input
          id={`${id}-destination`}
          list={`${id}-suggestions`}
          value={destination}
          disabled={!ready || working}
          onChange={(event) => setDestination(event.target.value)}
        />
      </label>
      <datalist id={`${id}-suggestions`}>
        {suggestions.map((path) => (
          <option key={path} value={path} />
        ))}
      </datalist>
      {review ? (
        <div className="workflow-review">
          <DiffViewer
            current={review.request.currentSource}
            candidate={review.request.candidate}
            currentLabel="Live config"
            candidateLabel="Candidate"
            target={review.target}
            blockingIssues={review.request.issues}
            confirmation={{
              label: "I reviewed this diff and want to replace the file",
              checked: reviewed,
              onChange: setReviewed,
            }}
          />
          {review.request.issues.length ? (
            <ul className="workflow-issues" aria-label="Validation notes">
              {review.request.issues.map((issue, index) => (
                <li key={`${issue.id}-${index}`}>
                  {issue.severity}: {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="form-actions">
            <button
              className="button button-primary"
              type="button"
              disabled={!reviewed}
              onClick={() => settle(true)}
            >
              Apply to file
            </button>
            <button
              className="button"
              type="button"
              onClick={() => settle(false)}
            >
              Cancel apply
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button
            className="button button-primary"
            type="button"
            disabled={!ready || working || !destination.trim()}
            onClick={() => void start()}
          >
            {working ? "Checking…" : "Review changes"}
          </button>
        </div>
      )}
      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      {result?.status === "applied" ? (
        <p role="status">{result.message}</p>
      ) : null}
      {result?.status === "cancelled" ? (
        <p role="status">Apply cancelled. Nothing was written.</p>
      ) : null}
      {result?.status === "blocked" ? (
        <div className="error-message" role="alert">
          <strong>
            Apply blocked by validation errors. Nothing was written.
          </strong>
          <ul>
            {result.issues
              .filter((issue) => issue.severity === "error")
              .map((issue, index) => (
                <li key={`${issue.id}-${index}`}>{issue.message}</li>
              ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
