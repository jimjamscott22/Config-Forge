import { FieldControls, type ControlsProps } from "./FieldControl";
import { behaviorFields } from "./control-fields";

export function BehaviorControls(props: ControlsProps) {
  return <FieldControls fields={behaviorFields} {...props} />;
}
