import { useId, useState } from "react";
import type { TerminalProject } from "../../domain/project";
import {
  defaultExportPath,
  type StudioWorkflows,
} from "../../services/studio-workflows";

export function ExportPanel({
  project,
  workflows,
}: {
  project: TerminalProject;
  workflows: StudioWorkflows;
}) {
  const id = useId();
  const [path, setPath] = useState(defaultExportPath(workflows.paths, project));
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setMessage(null);
    setError(null);
    setWorking(true);
    try {
      const receipt = await workflows.exportTo(project, path.trim());
      setMessage(
        `Exported ${receipt.bytesWritten} bytes to ${path.trim()} (sha256 ${receipt.sha256}).`,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="workflow-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Export a copy</h2>
      <p className="muted">
        Writes the generated config to a new file. Existing files are never
        replaced; use Apply for that.
      </p>
      <label className="workflow-field" htmlFor={`${id}-path`}>
        Export path
        <input
          id={`${id}-path`}
          value={path}
          disabled={working}
          onChange={(event) => setPath(event.target.value)}
        />
      </label>
      <div className="form-actions">
        <button
          className="button"
          type="button"
          disabled={working || !path.trim()}
          onClick={() => void run()}
        >
          Export config
        </button>
      </div>
      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
