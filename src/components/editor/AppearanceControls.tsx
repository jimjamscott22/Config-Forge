import { FieldControls, type ControlsProps } from "./FieldControl";
import { appearanceFields } from "./control-fields";

export function AppearanceControls(props: ControlsProps) {
  return <FieldControls fields={appearanceFields} {...props} />;
}
