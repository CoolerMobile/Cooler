import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Option,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { View } from "react-native";
import { upperFirstLetter } from "@/lib/utils";

type SettingsActionType = "switch" | "checkbox" | "select";

type SettingsActionProps = {
  type: SettingsActionType;
  checked?: boolean;
  disabled?: boolean;
  option?: Option;
  selectOptions?: string[];
  onOptionChange?: (option: Option) => void;
  onPress?: () => void;
  onCheckedChange?: (checked: boolean) => void;
};

export const SettingsAction = ({
  type,
  checked,
  disabled,
  option,
  selectOptions,
  onOptionChange,
  onPress,
  onCheckedChange,
}: SettingsActionProps) => {
  if (type === "select") {
    if (!selectOptions || !onOptionChange) {
      throw new Error(
        "selectOptions and onOptionChange must be provided when using the select component",
      );
    }

    return (
      <View>
        <Select
          value={option}
          disabled={disabled}
          onValueChange={onOptionChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent side="bottom" sideOffset={4} align="end">
            {selectOptions.map((value) => (
              <SelectItem
                key={value}
                value={value}
                label={upperFirstLetter(value)}
              >
                {upperFirstLetter(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </View>
    );
  }

  if (checked === undefined || !onCheckedChange) {
    throw new Error(
      "checked and onCheckedChange must be provided when using the switch or checkbox components",
    );
  }

  const Component = type === "switch" ? Switch : Checkbox;

  return (
    <View>
      <Component
        onPress={onPress}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </View>
  );
};
