import { SettingsAction } from "@/components/custom/settings/action";
import { SettingsItem } from "@/components/custom/settings/item";
import { SettingsSection } from "@/components/custom/settings/section";
import { useBiometrics } from "@/lib/hooks/security/biometrics";
import { useSettingsStore } from "@/lib/stores/settings";
import {
  BedSingle,
  Bell,
  BellOff,
  BookOpen,
  CalendarClock,
  DatabaseBackup,
  EyeOff,
  File,
  GitFork,
  Lock,
  Rocket,
  ScanFace,
  Server,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import * as Linking from "expo-linking";
import { View } from "react-native";
import { ReactNativeLegal } from "react-native-legal";
import { BottomSheet } from "@expo/ui/community/bottom-sheet";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { BrandIcon } from "@/components/custom/brand-icon";
import { siGithub } from "simple-icons";
import type { SettingKey } from "@/lib/types/settings";
import DateTimePicker from "@react-native-community/datetimepicker";

type AlertSettingKey = Extract<
  SettingKey,
  "deploymentAlerts" | "backupAlerts" | "scheduledTaskAlerts" | "serverAlerts"
>;

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
  const getSetting = useSettingsStore((state) => state.get);

  const toggleAlertRule = (key: AlertSettingKey, checked = !settings[key]) => {
    if (!hasHydrated) return;
    setSetting(key, checked);
  };

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

  // sheets states
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [quietOpen, setQuietOpen] = useState(false);

  // quiet hours
  const currentQuietFrom = getSetting("quietFrom");
  const currentQuietTo = getSetting("quietTo");
  const setQuietHours = (from: Date, to: Date) => {
    setSetting("quietFrom", from);
    setSetting("quietTo", to);
  };

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
            action={() => setAlertOpen(true)}
          />

          {/* quiet hours */}
          <SettingsItem
            icon={BellOff}
            title="Quiet Hours"
            description="When you shouldn't be notified"
            action={() => setQuietOpen(true)}
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
            description="Flip or shake your phone to hide"
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

      {/* alert rules */}
      <BottomSheet
        key="alert-sheet"
        index={alertOpen ? 0 : -1}
        onDismiss={() => setAlertOpen(false)}
        enablePanDownToClose
        snapPoints={["60%"]}
      >
        <View className="gap-4">
          <Text className="font-semibold text-lg text-center p-4">
            Alert Rules
          </Text>

          {/* rules */}
          <SettingsItem
            className="m-2"
            icon={Rocket}
            title="Deployments"
            description="Notify on any deployment event"
            action={() => toggleAlertRule("deploymentAlerts")}
            trailingAction={
              <SettingsAction
                type="switch"
                checked={settings.deploymentAlerts}
                disabled={!hasHydrated}
                onCheckedChange={(checked) =>
                  toggleAlertRule("deploymentAlerts", checked)
                }
              />
            }
          />

          <SettingsItem
            className="m-2"
            icon={DatabaseBackup}
            title="Backups"
            description="Notify when database backups finish"
            action={() => toggleAlertRule("backupAlerts")}
            trailingAction={
              <SettingsAction
                type="switch"
                checked={settings.backupAlerts}
                disabled={!hasHydrated}
                onCheckedChange={(checked) =>
                  toggleAlertRule("backupAlerts", checked)
                }
              />
            }
          />

          <SettingsItem
            className="m-2"
            icon={CalendarClock}
            title="Scheduled Tasks"
            description="Notify when scheduled tasks finish"
            action={() => toggleAlertRule("scheduledTaskAlerts")}
            trailingAction={
              <SettingsAction
                type="switch"
                checked={settings.scheduledTaskAlerts}
                disabled={!hasHydrated}
                onCheckedChange={(checked) =>
                  toggleAlertRule("scheduledTaskAlerts", checked)
                }
              />
            }
          />

          <SettingsItem
            className="m-2"
            icon={Server}
            title="Server Alerts"
            description="Notify about server health and updates"
            action={() => toggleAlertRule("serverAlerts")}
            trailingAction={
              <SettingsAction
                type="switch"
                checked={settings.serverAlerts}
                disabled={!hasHydrated}
                onCheckedChange={(checked) =>
                  toggleAlertRule("serverAlerts", checked)
                }
              />
            }
          />
        </View>
      </BottomSheet>

      {/* quiet hours */}
      <BottomSheet
        key="quiet-sheet"
        index={quietOpen ? 0 : -1}
        onDismiss={() => setQuietOpen(false)}
        enablePanDownToClose
        snapPoints={["35%"]}
      >
        <View className="gap-4">
          <Text className="font-semibold text-lg text-center p-4">
            Quiet Hours
          </Text>
          <View className="items-center gap-3">
            <Text className="text-center text-muted-foreground">From</Text>

            {/* from time */}
            <DateTimePicker
              key="quiet-from"
              value={currentQuietFrom}
              onValueChange={(_event, selectedDate) => {
                if (currentQuietFrom.getTime() !== selectedDate.getTime()) {
                  setQuietHours(selectedDate, currentQuietTo);
                }
              }}
              mode="time"
              display="compact"
            />

            <Text className="text-center text-muted-foreground">to</Text>

            {/* to time */}
            <DateTimePicker
              key="quiet-to"
              value={currentQuietTo}
              onValueChange={(_event, selectedDate) => {
                if (currentQuietTo.getTime() !== selectedDate.getTime()) {
                  setQuietHours(currentQuietFrom, selectedDate);
                }
              }}
              mode="time"
              display="compact"
            />
          </View>

          {/* save */}
          <Text className="text-muted-foreground text-xs text-center p-4">
            Values are saved automatically
          </Text>
        </View>
      </BottomSheet>

      {/* privacy policy sheet */}
      <BottomSheet
        key="privacy-sheet"
        index={privacyOpen ? 0 : -1}
        onDismiss={() => setPrivacyOpen(false)}
        enablePanDownToClose
        snapPoints={["40%"]}
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

          <Text className="text-muted-foreground">
            Still have doubts? I understand. The app is{" "}
            <Text className="font-semibold">completely open-source</Text>, so
            you can read the code in its entirety here:
          </Text>

          <Button
            className="items-center"
            onPress={async () =>
              await Linking.openURL("https://github.com/CoolerMobile/Cooler")
            }
          >
            <BrandIcon icon={siGithub} />
            <Text>View Cooler on GitHub</Text>
          </Button>
        </View>
      </BottomSheet>
    </>
  );
}
