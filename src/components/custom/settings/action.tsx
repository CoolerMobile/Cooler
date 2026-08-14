import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { View } from "react-native";

type SettingsActionType = "switch" | "checkbox";

type SettingsActionProps = {
  type: SettingsActionType;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export const SettingsAction = ({
  type,
  checked,
  disabled,
  onCheckedChange,
}: SettingsActionProps) => {
  const Component = type === "switch" ? Switch : Checkbox;

  return (
    <View>
      <Component
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </View>
  );
};
