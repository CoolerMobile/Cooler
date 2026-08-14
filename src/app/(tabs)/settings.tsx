import { SettingsAction } from "@/components/custom/settings/action";
import { SettingsItem } from "@/components/custom/settings/item";
import { SettingsSection } from "@/components/custom/settings/section";
import { useBiometrics } from "@/lib/hooks/security/biometrics";
import { useSettingsStore } from "@/lib/stores/settings";
import {
  BedSingle,
  Bell,
  BookOpen,
  EyeOff,
  File,
  Lock,
  ScanFace,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ReactNativeLegal } from "react-native-legal";

export default function SettingsScreen() {
  // launch oss licenses list
  const launchNotice = () => {
    ReactNativeLegal.launchLicenseListScreen("OSS Notice");
  };

  // validate biometrics on mount
  const { checkBioSupport, authenticate } = useBiometrics();
  const [bioSupported, setBioSupported] = useState(false);
  useEffect(() => {
    let isMounted = true;

    checkBioSupport()
      .then((supported) => {
        if (isMounted) setBioSupported(supported);
      })
      .catch(() => {
        if (isMounted) setBioSupported(false);
      });

    return () => {
      isMounted = false;
    };
  }, [checkBioSupport]);

  // settings store
  const settings = useSettingsStore((state) => state.settings);
  const hasHydrated = useSettingsStore((state) => state.hasHydrated);
  const setSetting = useSettingsStore((state) => state.set);

  // ui
  return (
    <View className="p-4 flex flex-col gap-6">
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
          icon={BedSingle}
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
          trailingAction={
            <SettingsAction
              type="switch"
              checked={settings.appLock}
              disabled={!hasHydrated || !bioSupported}
              onCheckedChange={async (checked) => {
                // request auth per checked value
                if (checked) {
                  const authResult = await authenticate({
                    promptDescription: "Confirm App Lock via Biometrics",
                  });

                  // validate result
                  if (authResult) {
                    // update setting value
                    setSetting("appLock", true);
                  }
                }

                // update setting value
                setSetting("appLock", checked);
              }}
            />
          }
        />

        {/* protect actions */}
        <SettingsItem
          icon={Lock}
          title="Protected Actions"
          description="Prevent unwanted actions"
          trailingAction={
            <SettingsAction
              type="switch"
              checked={settings.protectProductionActions}
              disabled={!hasHydrated}
              onCheckedChange={(checked) =>
                setSetting("protectProductionActions", checked)
              }
            />
          }
        />

        {/* hide sensitive values */}
        <SettingsItem
          icon={EyeOff}
          title="Hide Sensitive Values"
          description="Flip your phone to hide"
          trailingAction={
            <SettingsAction
              type="switch"
              checked={settings.hideSensitiveValues}
              disabled={!hasHydrated}
              onCheckedChange={(checked) =>
                setSetting("hideSensitiveValues", checked)
              }
            />
          }
        />
      </SettingsSection>

      {/* legal */}
      <SettingsSection title="Legal">
        {/* open-source notices */}
        <SettingsItem
          icon={BookOpen}
          title="Open Source Libraries"
          description="View the OSS libraries we depend on"
          action={launchNotice}
        />

        {/* privacy policy */}
        <SettingsItem
          icon={File}
          title="Privacy Policy"
          description="How your data is (not) handled"
          action={() => {}}
        />
      </SettingsSection>
    </View>
  );
}
