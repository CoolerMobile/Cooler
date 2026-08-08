import { Text } from "@/components/ui/text";
import { View } from "react-native";

export default function SettingsScreen() {
  return (
    <View className="flex-1 bg-background p-4">
      <Text variant="h1">Profile</Text>
      <Text className="mt-3" variant="muted">
        Profile tab placeholder
      </Text>
    </View>
  );
}
