import type { TerminalProject } from "../../domain/project";
import type { SharedConfig } from "../../domain/shared-config";
import { AppearanceControls } from "./AppearanceControls";
import { BehaviorControls } from "./BehaviorControls";
import { ColorControls } from "./ColorControls";
import { FontControls } from "./FontControls";
import { TerminalOverrides } from "./TerminalOverrides";

export function VisualControls({
  project,
  disabled,
  onChange,
}: {
  project: TerminalProject;
  disabled?: boolean;
  onChange(shared: SharedConfig): void;
}) {
  const preservedPaths = project.document.flatMap((node) => {
    if (
      node.kind !== "known-setting" ||
      !project.unmappedNodeIds.includes(node.id)
    )
      return [];
    return node.modelPath === "window.padding"
      ? ["window.paddingX", "window.paddingY"]
      : [node.modelPath];
  });
  const props = {
    shared: project.shared,
    terminal: project.terminal,
    disabled,
    preservedPaths,
    onChange,
  };
  return (
    <div className="visual-controls">
      <p className="eyebrow">Shape your terminal</p>
      <h2>Visual settings</h2>
      <p className="controls-intro">
        Empty fields inherit terminal defaults. Reset removes the explicit
        setting.
      </p>
      <details className="control-section" open>
        <summary>Typography</summary>
        <FontControls {...props} />
      </details>
      <details className="control-section">
        <summary>Window &amp; cursor</summary>
        <AppearanceControls {...props} />
      </details>
      <details className="control-section">
        <summary>Colors</summary>
        <ColorControls {...props} />
      </details>
      <details className="control-section">
        <summary>Behavior</summary>
        <BehaviorControls {...props} />
      </details>
      <details className="control-section">
        <summary>Preserved settings</summary>
        <TerminalOverrides project={project} />
      </details>
    </div>
  );
}
