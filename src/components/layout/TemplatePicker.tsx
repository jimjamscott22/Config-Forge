import { useEffect, useId, useState } from "react";
import type { TerminalId } from "../../domain/shared-config";
import type { ConfigTemplate } from "../../domain/template";
import type { TemplateService } from "../../services/template-service";

const filters = ["all", "ghostty", "kitty", "alacritty"] as const;
type Filter = (typeof filters)[number];

function download(name: string, json: string) {
  const url = URL.createObjectURL(
    new Blob([json], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase() || "templates"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function TemplatePicker({
  templates,
  service,
  busy = false,
  onUse,
}: {
  /** Shown until the service (if any) has loaded the full list. */
  templates: ConfigTemplate[];
  /** Enables duplicate, rename, delete, export, and import. */
  service?: TemplateService;
  busy?: boolean;
  onUse?(template: ConfigTemplate): void;
}) {
  const id = useId();
  const [loaded, setLoaded] = useState<ConfigTemplate[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const list = loaded ?? templates;
  const visible = list.filter(
    (template) =>
      filter === "all" ||
      template.terminal === "portable" ||
      template.terminal === (filter satisfies TerminalId),
  );
  const locked = busy || working;

  useEffect(() => {
    if (!service) return;
    let active = true;
    service
      .list()
      .then((all) => {
        if (active) setLoaded(all);
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [service]);

  async function run(action: () => Promise<void>) {
    if (!service) return;
    setWorking(true);
    setError(null);
    try {
      await action();
      setLoaded(await service.list());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="template-picker">
      <div className="template-toolbar">
        <label htmlFor={`${id}-filter`}>Terminal</label>
        <select
          id={`${id}-filter`}
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
        >
          {filters.map((item) => (
            <option key={item} value={item}>
              {item === "all" ? "All terminals" : item}
            </option>
          ))}
        </select>
        {service ? (
          <label className="button">
            Import bundle
            <input
              type="file"
              accept="application/json,.json"
              hidden
              disabled={locked}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file)
                  void run(
                    async () =>
                      void (await service.importBundle(await file.text())),
                  );
              }}
            />
          </label>
        ) : null}
      </div>
      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      {visible.length ? (
        <ul className="project-list">
          {visible.map((template) => (
            <li key={template.id} className="template-item">
              <button
                className="project-card"
                type="button"
                onClick={() => onUse?.(template)}
                disabled={locked}
              >
                <strong>{template.name}</strong>
                <span>
                  {template.builtIn ? "Built-in" : "Personal"} ·{" "}
                  {template.terminal}
                </span>
                <span>{template.description}</span>
              </button>
              {service ? (
                renaming?.id === template.id ? (
                  <form
                    className="template-actions"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const next = renaming;
                      void run(async () => {
                        await service.rename(next.id, next.name);
                        setRenaming(null);
                      });
                    }}
                  >
                    <label>
                      New name for {template.name}
                      <input
                        value={renaming.name}
                        onChange={(event) =>
                          setRenaming({
                            id: template.id,
                            name: event.target.value,
                          })
                        }
                      />
                    </label>
                    <button className="button" type="submit" disabled={locked}>
                      Save name
                    </button>
                    <button
                      className="button"
                      type="button"
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="template-actions">
                    <button
                      className="button"
                      type="button"
                      disabled={locked}
                      aria-label={`Duplicate ${template.name}`}
                      onClick={() =>
                        void run(
                          async () =>
                            void (await service.duplicate(
                              template.id,
                              `${template.name} copy`,
                            )),
                        )
                      }
                    >
                      Duplicate
                    </button>
                    <button
                      className="button"
                      type="button"
                      disabled={locked}
                      aria-label={`Export ${template.name}`}
                      onClick={() =>
                        void run(async () =>
                          download(
                            template.name,
                            await service.exportBundle([template.id]),
                          ),
                        )
                      }
                    >
                      Export
                    </button>
                    {!template.builtIn ? (
                      <>
                        <button
                          className="button"
                          type="button"
                          disabled={locked}
                          aria-label={`Rename ${template.name}`}
                          onClick={() =>
                            setRenaming({
                              id: template.id,
                              name: template.name,
                            })
                          }
                        >
                          Rename
                        </button>
                        <button
                          className="button"
                          type="button"
                          disabled={locked}
                          aria-label={`Delete ${template.name}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete the template "${template.name}"? Projects made from it are not affected.`,
                              )
                            )
                              void run(() => service.remove(template.id));
                          }}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <strong>Room for your next starting point.</strong>
          <p>
            No templates match this terminal. Begin with a blank config or save
            one of your own.
          </p>
        </div>
      )}
      {!service ? (
        <p className="template-note">
          Personal templates are saved by the desktop app once local storage is
          connected.
        </p>
      ) : null}
    </div>
  );
}
