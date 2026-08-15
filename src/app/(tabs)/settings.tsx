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
import { Pressable, View } from "react-native";
import { ReactNativeLegal } from "react-native-legal";
import { BottomSheet } from "@expo/ui/community/bottom-sheet";
import { Text } from "@/components/ui/text";

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

  const toggleAppLock = async (checked = !settings.appLock) => {
    if (!hasHydrated || !bioSupported) return;

    const authResult = await authenticate({
      promptDescription: "Confirm App Lock via Biometrics",
    });

    if (authResult.success) {
      setSetting("appLock", checked);
    }
  };

  const toggleProtectedActions = async (
    checked = !settings.protectProductionActions,
  ) => {
    if (!hasHydrated || !bioSupported) return;

    const authResult = await authenticate({
      promptDescription: "Confirm Protected Actions via Biometrics",
    });

    if (authResult.success) {
      setSetting("protectProductionActions", checked);
    }
  };

  const toggleSensitiveValues = async (
    checked = !settings.hideSensitiveValues,
  ) => {
    if (!hasHydrated || !bioSupported) return;

    const authResult = await authenticate({
      promptDescription: "Confirm Hide Sensitive Values via Biometrics",
    });

    if (authResult.success) {
      setSetting("hideSensitiveValues", checked);
    }
  };

  // privacy sheet state
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // ui
  return (
    <>
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
            action={() => toggleAppLock()}
            trailingAction={
              <SettingsAction
                type="switch"
                checked={settings.appLock}
                disabled={!hasHydrated || !bioSupported}
                onCheckedChange={toggleAppLock}
              />
            }
          />

          {/* protect actions */}
          <SettingsItem
            icon={Lock}
            title="Protected Actions"
            description="Prevent unwanted actions"
            action={() => toggleProtectedActions()}
            trailingAction={
              <SettingsAction
                type="switch"
                checked={settings.protectProductionActions}
                disabled={!hasHydrated || !bioSupported}
                onCheckedChange={toggleProtectedActions}
              />
            }
          />

          {/* hide sensitive values */}
          <SettingsItem
            icon={EyeOff}
            title="Hide Sensitive Values"
            description="Flip your phone to hide"
            action={() => toggleSensitiveValues()}
            trailingAction={
              <SettingsAction
                type="switch"
                checked={settings.hideSensitiveValues}
                disabled={!hasHydrated || !bioSupported}
                onCheckedChange={toggleSensitiveValues}
              />
            }
          />
        </SettingsSection>

        {/* legal */}
        <SettingsSection title="Legal">
          {/* privacy policy */}
          <SettingsItem
            icon={File}
            title="Privacy Policy"
            description="How your data is (not) handled"
            action={() => setPrivacyOpen(true)}
          />

          {/* open-source notices */}
          <SettingsItem
            icon={BookOpen}
            title="Open Source Libraries"
            description="View the OSS libraries we depend on"
            action={launchNotice}
          />
        </SettingsSection>
      </View>
      <BottomSheet
        index={privacyOpen ? 0 : -1}
        onDismiss={() => setPrivacyOpen(false)}
        enablePanDownToClose
        snapPoints={["25%"]}
      >
        <View className="gap-4 p-4">
          <Text className="font-semibold text-lg text-center">
            Privacy Policy
          </Text>
          <Text className="text-muted-foreground">
            There is no policy. Every single bit of your data is handled{" "}
            <Text className="font-semibold">100% on-device</Text>.
          </Text>

          <Text className="text-muted-foreground">
            This means that, aside from error reporting data, which does{" "}
            <Text className="font-semibold">not</Text> include any of your own
            data, and is completely anonymised pre-flight, nothing ever leaves
            your device.
          </Text>
        </View>
      </BottomSheet>
    </>
  );
}
