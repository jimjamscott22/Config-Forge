import { FieldControls, type ControlsProps } from "./FieldControl";
import { ansiFields, colorFields } from "./control-fields";

export function ColorControls(props: ControlsProps) {
  return (
    <>
      <FieldControls fields={colorFields} {...props} />
      <details className="ansi-controls">
        <summary>ANSI palette · 16 colors</summary>
        <FieldControls fields={ansiFields} {...props} />
      </details>
    </>
  );
}
