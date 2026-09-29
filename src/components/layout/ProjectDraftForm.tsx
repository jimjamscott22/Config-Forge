import { useRef, useState, type FormEvent } from "react";
import { getAdapter } from "../../adapters/registry";
import type { TerminalProject } from "../../domain/project";
import { terminalIdSchema, type TerminalId } from "../../domain/shared-config";
import type { ConfigTemplate } from "../../domain/template";
import { makeProject } from "../../services/project-service";
import { projectFromTemplate } from "../../services/template-service";

export function ProjectDraftForm({
  mode,
  initialTerminal = "ghostty",
  template,
  onOpen,
  onCancel,
}: {
  mode: "create" | "import";
  initialTerminal?: TerminalId;
  template?: ConfigTemplate;
  onOpen(project: TerminalProject): boolean;
  onCancel(): void;
}) {
  const [name, setName] = useState(template?.name ?? "Untitled config");
  const [terminal, setTerminal] = useState(initialTerminal);
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const fileRequest = useRef(0);
  const importing = mode === "import";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      if (importing && !source.trim())
        throw new Error("Choose a file or paste a configuration first.");
      if (importing) {
        const errors = getAdapter(terminal)
          .parse(source)
          .issues.filter((issue) => issue.severity === "error");
        if (errors.length)
          throw new Error(errors.map((issue) => issue.message).join(" "));
      }
      const project = template
        ? projectFromTemplate(template, terminal, name.trim())
        : makeProject({
            name: name.trim(),
            terminal,
            source: importing ? source : "",
          });
      onOpen(project);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <section className="draft-view" aria-labelledby="view-title">
      <p className="eyebrow">
        {importing
          ? "Bring your own"
          : template
            ? "Start from a template"
            : "Start fresh"}
      </p>
      <h1 id="view-title" tabIndex={-1}>
        {importing ? "Import a config" : "Create a config"}
      </h1>
      <p className="lede">
        {importing
          ? "Choose a file or paste its source. Your original file stays untouched."
          : "Choose a terminal and give your workspace a name."}
      </p>
      <form className="panel draft-form" onSubmit={submit}>
        <label htmlFor="project-name">Project name</label>
        <input
          id="project-name"
          value={name}
          maxLength={120}
          required
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="terminal-format">Terminal</label>
        <select
          id="terminal-format"
          value={terminal}
          onChange={(event) =>
            setTerminal(terminalIdSchema.parse(event.target.value))
          }
          disabled={Boolean(template && template.terminal !== "portable")}
        >
          <option value="ghostty">Ghostty</option>
          <option value="kitty">Kitty</option>
          <option value="alacritty">Alacritty</option>
        </select>
        {importing ? (
          <>
            <label htmlFor="config-file">Configuration file</label>
            <input
              id="config-file"
              type="file"
              disabled={reading}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const request = ++fileRequest.current;
                setReading(true);
                setError(null);
                try {
                  if (file.size > 1024 * 1024)
                    throw new Error(
                      "Choose a configuration smaller than 1 MiB.",
                    );
                  const text = await file.text();
                  if (request === fileRequest.current) setSource(text);
                } catch (error) {
                  if (request === fileRequest.current)
                    setError(
                      error instanceof Error ? error.message : String(error),
                    );
                } finally {
                  if (request === fileRequest.current) setReading(false);
                }
              }}
            />
            <label htmlFor="config-source">Configuration source</label>
            <textarea
              id="config-source"
              value={source}
              rows={10}
              spellCheck={false}
              disabled={reading}
              onChange={(event) => setSource(event.target.value)}
              placeholder="Paste your terminal configuration here"
            />
          </>
        ) : null}
        {error ? (
          <p className="error-message" role="alert">
            {error}
          </p>
        ) : null}
        <p className="draft-notice">
          Drafts stay in this session. Saving and applying are not available
          yet.
        </p>
        <div className="form-actions">
          <button className="button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={reading}
          >
            {reading ? "Reading file…" : "Open draft"}
          </button>
        </div>
      </form>
    </section>
  );
}
