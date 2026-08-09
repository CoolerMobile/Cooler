import { Text } from "@/components/ui/text";
import type { ReactNode } from "react";
import { View } from "react-native";

type SettingsSectionProps = {
  title: string;
  children?: ReactNode;
};

export const SettingsSection = ({ title, children }: SettingsSectionProps) => {
  return (
    <View className="gap-2">
      <Text className="text-muted-foreground px-1 text-sm font-medium">
        {title}
      </Text>
      <View className="overflow-hidden rounded-xl flex flex-col gap-2">
        {children}
      </View>
    </View>
  );
};
