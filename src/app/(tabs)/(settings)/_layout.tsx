import { SettingsGitHub } from "@/components/custom/settings/github"
import { useAppTheme } from "@/components/custom/theme"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useNotifications } from "@/lib/hooks/notifications"
import { NAV_THEME } from "@/lib/theme"
import { Stack } from "expo-router"
import { BellPlus } from "lucide-react-native"
import { Alert } from "react-native"

export default function SettingsLayout() {
  const { colorScheme } = useAppTheme()
  const theme = NAV_THEME[colorScheme]

  // env
  const isDev = process.env.NODE_ENV === "development"

  // screen
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
      }}>
      <Stack.Screen
        name="settings"
        options={{
          title: "Cooler",
          headerLeft: isDev ? () => <ScheduleNotif /> : undefined,
          headerRight: () => <SettingsGitHub />,
        }}
      />
    </Stack>
  )
}

// debug: schedule notification
const ScheduleNotif = () => {
  // notifications
  const { createLocalNotification, enableLocalNotifications } = useNotifications()

  // button
  return (
    <Button
      variant="ghost"
      onPress={() => {
        Alert.alert("Trigger Debug Notification", "Schedule a local notification?", [
          {
            style: "destructive",
            text: "Schedule Notification",
            onPress: async () => {
              try {
                const notificationsEnabled = await enableLocalNotifications()
                if (!notificationsEnabled) {
                  Alert.alert(
                    "Notifications are off",
                    "Allow notification alerts in system settings, then try again."
                  )
                  return
                }

                await createLocalNotification({
                  title: "Debug",
                  body: `Triggered at: ${new Date().toLocaleString()}`,
                })
              } catch (error) {
                Alert.alert(
                  "Notification failed",
                  error instanceof Error ? error.message : "The local notification could not be scheduled."
                )
              }
            },
          },
          {
            text: "Cancel",
          },
        ])
      }}>
      <Icon as={BellPlus} />
    </Button>
  )
}
