import { FieldControls, type ControlsProps } from "./FieldControl";
import { fontFields } from "./control-fields";

export function FontControls(props: ControlsProps) {
  return <FieldControls fields={fontFields} {...props} />;
}
