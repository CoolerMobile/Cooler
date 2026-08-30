import { SettingsAction } from "@/components/custom/settings/action";
import { SettingsItem } from "@/components/custom/settings/item";
import { SettingsSection } from "@/components/custom/settings/section";
import { useBiometrics } from "@/lib/hooks/security/biometrics";
import { useAppTheme } from "@/components/custom/theme";
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
  Smartphone,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { ReactNativeLegal } from "react-native-legal";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { SettingKey } from "@/lib/types/settings";
import DateTimePicker from "@react-native-community/datetimepicker";

import { Option } from "@/components/ui/select";

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
  const [alertOpen, setAlertOpen] = useState(false);
  const [quietOpen, setQuietOpen] = useState(false);
  const [androidQuietPicker, setAndroidQuietPicker] = useState<
    "from" | "to" | null
  >(null);

  // quiet hours
  const currentQuietFrom = getSetting("quietFrom");
  const currentQuietTo = getSetting("quietTo");
  const setQuietHours = (from: Date, to: Date) => {
    setSetting("quietFrom", from);
    setSetting("quietTo", to);
  };
  const formatQuietTime = (date: Date) =>
    date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });

  // current theme
  const { colorSchemePreference, setColorScheme } = useAppTheme();
  const currentTheme =
    colorSchemePreference === "system"
      ? "System"
      : colorSchemePreference === "dark"
        ? "Dark Mode"
        : "Light Mode";
  const toggleTheme = async (option: Option) => {
    const theme = option?.value;

    if (theme !== "light" && theme !== "dark" && theme !== "system") {
      throw new Error("[settings] invalid theme chosen");
    }

    await setColorScheme(theme);
  };

  // ui
  return (
    <>
      <View className="py-2 px-4 flex flex-col gap-4">
        {/* visuals */}
        <SettingsSection title="Visuals">
          {/* theme toggle */}
          <SettingsItem
            icon={Smartphone}
            title="App Theme"
            trailingAction={
              <SettingsAction
                type="select"
                option={{
                  value: colorSchemePreference,
                  label: currentTheme,
                }}
                selectOptions={["dark", "light", "system"]}
                onOptionChange={(option) => {
                  void toggleTheme(option).catch(() => undefined);
                }}
              />
            }
          />
        </SettingsSection>

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

        {/* libraries */}
        <SettingsSection title="Libraries">
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
        onDismiss={() => {
          setQuietOpen(false);
          setAndroidQuietPicker(null);
        }}
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
            {Platform.OS === "android" ? (
              <Button
                variant="outline"
                onPress={() => setAndroidQuietPicker("from")}
                accessibilityLabel="Set quiet hours start time"
              >
                <Text>{formatQuietTime(currentQuietFrom)}</Text>
              </Button>
            ) : (
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
            )}

            <Text className="text-center text-muted-foreground">to</Text>

            {/* to time */}
            {Platform.OS === "android" ? (
              <Button
                variant="outline"
                onPress={() => setAndroidQuietPicker("to")}
                accessibilityLabel="Set quiet hours end time"
              >
                <Text>{formatQuietTime(currentQuietTo)}</Text>
              </Button>
            ) : (
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
            )}

            {Platform.OS === "android" && androidQuietPicker && (
              <DateTimePicker
                key={`quiet-${androidQuietPicker}`}
                value={
                  androidQuietPicker === "from"
                    ? currentQuietFrom
                    : currentQuietTo
                }
                onValueChange={(_event, selectedDate) => {
                  if (androidQuietPicker === "from") {
                    if (currentQuietFrom.getTime() !== selectedDate.getTime()) {
                      setQuietHours(selectedDate, currentQuietTo);
                    }
                  } else if (
                    currentQuietTo.getTime() !== selectedDate.getTime()
                  ) {
                    setQuietHours(currentQuietFrom, selectedDate);
                  }

                  setAndroidQuietPicker(null);
                }}
                onDismiss={() => setAndroidQuietPicker(null)}
                mode="time"
              />
            )}
          </View>

          {/* save */}
          <Text className="text-muted-foreground text-xs text-center p-4">
            Values are saved automatically
          </Text>
        </View>
      </BottomSheet>
    </>
  );
}
