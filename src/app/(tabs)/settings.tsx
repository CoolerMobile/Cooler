import { SettingsItem } from "@/components/custom/settings/item";
import { SettingsSection } from "@/components/custom/settings/section";
import {
  Bell,
  EyeOff,
  Hourglass,
  Lock,
  ScanFace,
  Server,
} from "lucide-react-native";
import { View } from "react-native";

export default function SettingsScreen() {
  return (
    <View className="p-4 flex flex-col gap-6">
      {/* connections */}
      <SettingsSection title="Servers">
        <SettingsItem
          icon={Server}
          title="Connected Servers"
          description="Manage connected servers"
          action={() => {}}
        />
      </SettingsSection>

      {/* notifications */}
      <SettingsSection title="Notifications">
        {/* rules */}
        <SettingsItem
          icon={Bell}
          title="Alert Rules"
          description="When you should be notified"
          action={() => {}}
        />

        {/* quiet hours */}
        <SettingsItem
          icon={Hourglass}
          title="Quiet Hours"
          description="When you shouldn't be notified"
          action={() => {}}
        />
      </SettingsSection>

      {/* security */}
      <SettingsSection title="Security">
        {/* biometrics */}
        <SettingsItem
          icon={ScanFace}
          title="App Lock"
          description="Use biometrics to lock the app"
          action={() => {}}
        />

        {/* protect actions */}
        <SettingsItem
          icon={Lock}
          title="Protect Production Actions"
          description="Prevent unwanted actions"
          action={() => {}}
        />

        {/* hide sensitive values */}
        <SettingsItem
          icon={EyeOff}
          title="Hide Sensitive Values"
          description="Flip your phone to hide or unhide"
          action={() => {}}
        />
      </SettingsSection>
    </View>
  );
}
