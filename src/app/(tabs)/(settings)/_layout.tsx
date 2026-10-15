import { SettingsGitHub } from "@/components/custom/settings/github"
import { useAppTheme } from "@/components/custom/theme"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useNotifications } from "@/lib/hooks/notifications"
import { testSentryConnection } from "@/lib/sentry-test"
import { NAV_THEME } from "@/lib/theme"
import * as Sentry from "@sentry/react-native"
import { Stack } from "expo-router"
import { BellPlus, Bug } from "lucide-react-native"
import { Alert, View } from "react-native"

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
          headerLeft: isDev ? () => <DebugActions /> : undefined,
          headerRight: () => <SettingsGitHub />,
        }}
      />
    </Stack>
  )
}

const DebugActions = () => (
  <View className="flex-row">
    <ScheduleNotif />
    <TriggerSentryException />
  </View>
)

// debug: schedule notification
const ScheduleNotif = () => {
  // notifications
  const { createLocalNotification, enableLocalNotifications } = useNotifications()

  // button
  return (
    <Button
      variant="ghost"
      accessibilityLabel="Trigger debug notification"
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

// debug: send a handled exception through the real Sentry transport
const TriggerSentryException = () => (
  <Button
    variant="ghost"
    accessibilityLabel="Trigger test exception"
    onPress={() => {
      Alert.alert("Trigger Test Exception", "Send a handled test exception to GlitchTip?", [
        {
          style: "destructive",
          text: "Send Exception",
          onPress: async () => {
            try {
              const eventId = await testSentryConnection(Sentry)
              Alert.alert("Test exception sent", `Event ID: ${eventId}`)
            } catch (error) {
              Alert.alert(
                "Exception failed",
                error instanceof Error ? error.message : "The test exception could not be sent."
              )
            }
          },
        },
        {
          text: "Cancel",
        },
      ])
    }}>
    <Icon as={Bug} />
  </Button>
)
