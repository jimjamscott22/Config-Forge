import { useId } from "react";
import type { ValidationIssue } from "../../domain/validation";
import { diffSourceLines } from "./source-reconcile";

export interface DiffTarget {
  path: string;
  isSymlink: boolean;
  /** Where the pre-write backup will go; null when no backup is needed. */
  backupDestination: string | null;
}

const marks = { added: "+", removed: "−", unchanged: " " } as const;
const labels = {
  added: "Added",
  removed: "Removed",
  unchanged: "Unchanged",
} as const;

export function DiffViewer({
  current,
  candidate,
  currentLabel = "Current",
  candidateLabel = "Candidate",
  target,
  blockingIssues = [],
  confirmation,
}: {
  /** Live source, or null when the destination does not exist yet. */
  current: string | null;
  candidate: string;
  currentLabel?: string;
  candidateLabel?: string;
  target?: DiffTarget;
  blockingIssues?: ValidationIssue[];
  confirmation?: {
    label: string;
    checked: boolean;
    onChange(checked: boolean): void;
  };
}) {
  const id = useId();
  const lines = diffSourceLines(current, candidate);
  const count = (kind: keyof typeof marks) =>
    lines.filter((line) => line.kind === kind).length;
  const errors = blockingIssues.filter((issue) => issue.severity === "error");
  return (
    <section className="diff-viewer" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        {currentLabel} → {candidateLabel}
      </h3>
      <p className="diff-summary" role="status">
        {count("added")} added · {count("removed")} removed ·{" "}
        {count("unchanged")} unchanged
      </p>
      {target ? (
        <dl className="diff-target">
          <dt>Destination</dt>
          <dd>{target.path}</dd>
          <dt>Backup</dt>
          <dd>
            {target.backupDestination ??
              "No backup needed; the destination does not exist yet."}
          </dd>
          <dt>Symlink</dt>
          <dd>
            {target.isSymlink
              ? "The destination is a symbolic link. Config Forge refuses to write through symlinks."
              : "The destination is not a symbolic link; it is replaced atomically."}
          </dd>
        </dl>
      ) : null}
      {errors.length ? (
        <div className="diff-blocking" role="alert">
          <strong>Blocked by validation errors</strong>
          <ul>
            {errors.map((issue, index) => (
              <li key={`${issue.id}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {lines.length ? (
        <ul className="diff-lines" aria-label="Changed lines">
          {lines.map((line, index) => (
            <li key={index} className={`diff-line diff-${line.kind}`}>
              <span aria-hidden="true">{marks[line.kind]}</span>
              <span className="diff-label">{labels[line.kind]}: </span>
              <code>{line.text || " "}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="diff-empty">No differences.</p>
      )}
      {confirmation ? (
        <label className="diff-confirm">
          <input
            type="checkbox"
            checked={confirmation.checked}
            disabled={errors.length > 0}
            onChange={(event) => confirmation.onChange(event.target.checked)}
          />
          {confirmation.label}
        </label>
      ) : null}
    </section>
  );
}
