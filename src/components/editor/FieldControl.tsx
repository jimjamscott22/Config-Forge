import { useId, useState } from "react";
import type { SharedConfig, TerminalId } from "../../domain/shared-config";
import { fieldSupport, type ControlField } from "./control-fields";

export interface ControlsProps {
  shared: SharedConfig;
  terminal: TerminalId;
  disabled?: boolean;
  preservedPaths?: readonly string[];
  onChange(shared: SharedConfig): void;
}

export function FieldControl({
  field,
  shared,
  terminal,
  disabled,
  preservedPaths,
  onChange,
}: ControlsProps & { field: ControlField }) {
  const id = useId();
  const value = field.read(shared);
  const [draft, setDraft] = useState<{
    base: typeof value;
    text: string;
    error: string | null;
  } | null>(null);
  // A parent change supersedes local text; invalid typing stays local to this field.
  const currentDraft = draft?.base === value ? draft : null;
  const text = currentDraft?.text ?? (value === null ? "" : String(value));
  const error = currentDraft?.error;
  const support = fieldSupport(terminal, field.path);
  const preserved = preservedPaths?.includes(field.path);
  const locked = disabled || !support.supported || preserved;
  const options =
    field.path === "window.decorations" && terminal === "alacritty"
      ? field.options?.filter((option) => option !== "client")
      : field.options;
  function update(nextText: string) {
    const result = field.update(shared, nextText);
    if (!result.success) {
      setDraft({ base: value, text: nextText, error: result.message });
      return;
    }
    setDraft({ base: field.read(result.shared), text: nextText, error: null });
    onChange(result.shared);
  }
  return (
    <div className={`config-field${locked ? " field-unavailable" : ""}`}>
      <label htmlFor={id}>{field.label}</label>
      <div className="field-input-row">
        {field.kind === "select" || field.kind === "boolean" ? (
          <select
            id={id}
            value={text}
            disabled={locked}
            aria-describedby={`${id}-help`}
            onChange={(event) => update(event.target.value)}
          >
            <option value="">Terminal default</option>
            {field.kind === "boolean" ? (
              <>
                <option value="true">On</option>
                <option value="false">Off</option>
              </>
            ) : (
              options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))
            )}
          </select>
        ) : (
          <input
            id={id}
            type="text"
            inputMode={field.kind === "number" ? "decimal" : undefined}
            value={text}
            disabled={locked}
            spellCheck={false}
            placeholder={
              field.kind === "color" ? "#rrggbb / default" : "Terminal default"
            }
            aria-invalid={Boolean(error)}
            aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
            onChange={(event) => update(event.target.value)}
          />
        )}
        <button
          type="button"
          className="field-reset"
          aria-label={`Reset ${field.label} to terminal default`}
          disabled={locked || (value === null && text === "" && !error)}
          onClick={() => {
            setDraft(null);
            update("");
          }}
        >
          Reset
        </button>
      </div>
      <p id={`${id}-help`} className="field-help">
        {preserved ? (
          "A preserved source value is outside the visual model. This field is read-only to protect it."
        ) : support.supported ? (
          <>
            <code>{support.native}</code>
            <span>
              {support.portableTo.length
                ? `Exact to ${support.portableTo.join(", ")}`
                : "Omitted when translated to other terminals"}
            </span>
          </>
        ) : (
          "No writable mapping in this adapter. Preserved source stays unchanged."
        )}
        {terminal === "kitty" && field.path === "window.paddingX" ? (
          <span>Kitty uses this value for both axes.</span>
        ) : null}
        {terminal === "ghostty" && field.path === "behavior.scrollbackLines" ? (
          <span>Ghostty measures this limit in bytes.</span>
        ) : null}
        {terminal === "kitty" && field.path === "behavior.visualBell" ? (
          <span>
            This mapping disables the audio bell; it does not add a visual
            flash.
          </span>
        ) : null}
      </p>
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FieldControls({
  fields,
  ...props
}: ControlsProps & { fields: readonly ControlField[] }) {
  return (
    <div className="field-list">
      {fields.map((field) => (
        <FieldControl key={field.path} field={field} {...props} />
      ))}
    </div>
  );
}
