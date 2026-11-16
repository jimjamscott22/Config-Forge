import { useEffect, useId, useRef, useState } from "react";
import type { TerminalProject } from "../../domain/project";

export function ProjectSwitcher({
  current,
  projects,
  busy,
  onOpen,
  onHome,
  onSaveAsTemplate,
}: {
  current: TerminalProject;
  projects: TerminalProject[];
  busy: boolean;
  onOpen(id: string): void;
  onHome(): void;
  onSaveAsTemplate?(project: TerminalProject): void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const others = projects.filter((project) => project.id !== current.id);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target))
        setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div
      className="project-switcher"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        className="project-switcher-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="project-switcher-name">{current.name}</span>
        <span className="project-switcher-terminal">{current.terminal}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div
          ref={menu}
          id={`${id}-menu`}
          className="project-switcher-menu"
          role="menu"
          aria-label="Projects"
        >
          <div
            className="project-switcher-item current"
            role="menuitem"
            aria-current="page"
            aria-disabled="true"
          >
            {current.name}
            <span>{current.terminal}</span>
          </div>
          {others.map((project) => (
            <button
              key={project.id}
              className="project-switcher-item"
              type="button"
              role="menuitem"
              onClick={() => choose(() => onOpen(project.id))}
            >
              {project.name}
              <span>{project.terminal}</span>
            </button>
          ))}
          <div className="project-switcher-divider" role="separator" />
          {onSaveAsTemplate ? (
            <button
              className="project-switcher-item"
              type="button"
              role="menuitem"
              onClick={() => choose(() => onSaveAsTemplate(current))}
            >
              Save as template
            </button>
          ) : null}
          <button
            className="project-switcher-item"
            type="button"
            role="menuitem"
            onClick={() => choose(onHome)}
          >
            Back to workbench
          </button>
        </div>
      ) : null}
    </div>
  );
}
