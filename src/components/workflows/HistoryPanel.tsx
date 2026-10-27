import { useId, useState } from "react";
import type { TerminalProject } from "../../domain/project";
import type { ProjectSnapshot } from "../../domain/snapshot";
import type { StudioWorkflows } from "../../services/studio-workflows";

function describe(snapshot: ProjectSnapshot) {
  return snapshot.kind === "named"
    ? snapshot.label
    : `Automatic · ${snapshot.reason}`;
}

export function HistoryPanel({
  project,
  workflows,
  snapshots,
  ready,
  onChanged,
  onRestored,
  confirm = (message) => window.confirm(message),
}: {
  project: TerminalProject;
  workflows: StudioWorkflows;
  snapshots: ProjectSnapshot[];
  ready: boolean;
  onChanged(): Promise<void>;
  onRestored(project: TerminalProject): Promise<void>;
  confirm?(message: string): boolean;
}) {
  const id = useId();
  const [label, setLabel] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function guarded(action: () => Promise<string>) {
    setError(null);
    setMessage(null);
    setWorking(true);
    try {
      setMessage(await action());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="workflow-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>History</h2>
      {!ready ? (
        <p role="status">Save the project to create or restore snapshots.</p>
      ) : null}
      <label className="workflow-field" htmlFor={`${id}-label`}>
        Snapshot name
        <input
          id={`${id}-label`}
          value={label}
          disabled={!ready || working}
          onChange={(event) => setLabel(event.target.value)}
        />
      </label>
      <div className="form-actions">
        <button
          className="button"
          type="button"
          disabled={!ready || working || !label.trim()}
          onClick={() =>
            void guarded(async () => {
              const created = await workflows.snapshot(project, label.trim());
              setLabel("");
              await onChanged();
              return `Saved snapshot “${describe(created)}”.`;
            })
          }
        >
          Create named snapshot
        </button>
      </div>
      {snapshots.length ? (
        <ul className="snapshot-list" aria-label="Snapshots">
          {snapshots.map((snapshot) => (
            <li key={snapshot.id}>
              <span>
                <strong>{describe(snapshot)}</strong>
                <time dateTime={snapshot.createdAt}>
                  {new Date(snapshot.createdAt).toLocaleString()}
                </time>
              </span>
              <button
                className="button"
                type="button"
                disabled={!ready || working}
                aria-label={`Restore ${describe(snapshot)}`}
                onClick={() => {
                  if (
                    !confirm(
                      `Restore “${describe(snapshot)}”? The current project is snapshotted first.`,
                    )
                  )
                    return;
                  void guarded(async () => {
                    const restored = await workflows.restore(
                      project,
                      snapshot.id,
                    );
                    await onRestored(restored);
                    return `Restored “${describe(snapshot)}”.`;
                  });
                }}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No snapshots yet.</p>
      )}
      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
