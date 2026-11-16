import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type SidePanelTab =
  "source" | "validation" | "write" | "export" | "translate" | "history";

export interface SidePanelSection {
  id: SidePanelTab;
  label: string;
  content: ReactNode;
}

const focusable =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function StudioSidePanel({
  open,
  active,
  sections,
  note,
  onSelect,
  onClose,
}: {
  open: boolean;
  active: SidePanelTab;
  /** Only the tabs that exist in this context. */
  sections: SidePanelSection[];
  /** Persistence line shown above the tabs. */
  note?: ReactNode;
  onSelect(tab: SidePanelTab): void;
  /** The caller restores focus to whichever control opened the panel. */
  onClose(): void;
}) {
  const id = useId();
  const tabButtons = useRef<Partial<Record<SidePanelTab, HTMLButtonElement>>>(
    {},
  );
  const panels = useRef<Partial<Record<SidePanelTab, HTMLDivElement>>>({});
  const selected = sections.some((section) => section.id === active)
    ? active
    : sections[0]?.id;

  // Move focus into the panel when it opens (or is re-targeted from outside),
  // but never while the user is navigating inside it.
  useEffect(() => {
    if (!open || !selected) return;
    const root = tabButtons.current[selected]?.closest(".studio-side-panel");
    if (root?.contains(document.activeElement)) return;
    const panel = panels.current[selected];
    const target =
      panel?.querySelector<HTMLElement>(focusable) ??
      tabButtons.current[selected];
    target?.focus();
  }, [open, selected]);

  if (!open || !selected) return null;

  function keydown(event: KeyboardEvent<HTMLButtonElement>, tab: SidePanelTab) {
    const ids = sections.map((section) => section.id);
    const index = ids.indexOf(tab);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? ids.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % ids.length
            : event.key === "ArrowLeft"
              ? (index - 1 + ids.length) % ids.length
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = ids[nextIndex];
    if (next) {
      onSelect(next);
      tabButtons.current[next]?.focus();
    }
  }

  return (
    <div
      className="studio-side-panel"
      role="dialog"
      aria-modal="false"
      aria-label="Project tools"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="side-panel-header">
        {note ? <div className="side-panel-note">{note}</div> : <span />}
        <button className="button" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="side-panel-tabs" role="tablist" aria-label="Tools">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            id={`${id}-${section.id}-tab`}
            aria-controls={`${id}-${section.id}-panel`}
            aria-selected={selected === section.id}
            tabIndex={selected === section.id ? 0 : -1}
            ref={(element) => {
              if (element) tabButtons.current[section.id] = element;
            }}
            onClick={() => onSelect(section.id)}
            onKeyDown={(event) => keydown(event, section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>
      {sections.map((section) => (
        <div
          key={section.id}
          className="side-panel-body"
          role="tabpanel"
          id={`${id}-${section.id}-panel`}
          aria-labelledby={`${id}-${section.id}-tab`}
          hidden={selected !== section.id}
          ref={(element) => {
            if (element) panels.current[section.id] = element;
          }}
        >
          {section.content}
        </div>
      ))}
    </div>
  );
}
