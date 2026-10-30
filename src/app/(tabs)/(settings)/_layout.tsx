import { SettingsGitHub } from "@/components/custom/settings/github"
import { useAppTheme } from "@/components/custom/theme"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { useNotifications } from "@/lib/hooks/notifications"
import { testSentryConnection } from "@/lib/sentry-test"
import { NAV_THEME } from "@/lib/theme"
import DateTimePicker from "@react-native-community/datetimepicker"
import * as Sentry from "@sentry/react-native"
import { Stack } from "expo-router"
import { BellPlus, Bug, KeyRound, Send } from "lucide-react-native"
import { useState } from "react"
import { ActivityIndicator, Alert, Platform, View } from "react-native"

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
    <DebugNotification />
    <TriggerSentryException />
  </View>
)

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

// debug: exercise the Expo remote-notification pipeline
const DebugNotification = () => {
  const { getExpoPushToken, scheduleExpoPushToSelf } = useNotifications()

  // sheet + flow selection
  const [open, setOpen] = useState(false)
  const [flow, setFlow] = useState<"expo" | "token" | null>(null)
  const [busy, setBusy] = useState(false)

  // full-expo-flow options (time selector is optional)
  const [schedule, setSchedule] = useState(false)
  const [fireDate, setFireDate] = useState(() => new Date())
  const [androidPicker, setAndroidPicker] = useState(false)

  // print-token flow
  const [token, setToken] = useState<string | null>(null)

  const resetState = () => {
    setFlow(null)
    setBusy(false)
    setSchedule(false)
    setFireDate(new Date())
    setAndroidPicker(false)
    setToken(null)
  }

  const close = () => {
    setOpen(false)
    resetState()
  }

  // option 1: full Expo flow - deliver a remote push to this device
  const sendExpoNotification = async () => {
    try {
      setBusy(true)
      const target = schedule ? fireDate : null
      const { scheduledFor } = await scheduleExpoPushToSelf(
        {
          title: "Debug",
          body: target
            ? `Scheduled for: ${target.toLocaleString()}`
            : `Triggered at: ${new Date().toLocaleString()}`,
        },
        target
      )
      close()
      Alert.alert(
        scheduledFor ? "Notification scheduled" : "Notification sent",
        scheduledFor
          ? `Expo will deliver it around ${scheduledFor.toLocaleString()}. Keep the app running until then.`
          : "Expo is delivering the remote notification now."
      )
    } catch (error) {
      Alert.alert(
        "Notification failed",
        errorMessage(error, "The remote notification could not be sent through Expo.")
      )
    } finally {
      setBusy(false)
    }
  }

  // option 2: print the device's Expo push token for off-app API testing
  const printToken = async () => {
    try {
      setBusy(true)
      setFlow("token")
      const value = await getExpoPushToken()
      // printed to the console so it can be copied for off-app push testing
      console.log("[debug] Expo push token:", value)
      setToken(value)
    } catch (error) {
      close()
      Alert.alert("Token unavailable", errorMessage(error, "The Expo push token could not be obtained."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="ghost" accessibilityLabel="Trigger debug notification" onPress={() => setOpen(true)}>
        <Icon as={BellPlus} />
      </Button>

      <BottomSheet
        key="debug-notification-sheet"
        index={open ? 0 : -1}
        onDismiss={close}
        enablePanDownToClose
        snapPoints={["42%"]}>
        <View className="gap-4 p-4">
          <Text className="text-center text-lg font-semibold">Debug Notification</Text>

          {/* flow selection */}
          {flow === null && (
            <View className="gap-3">
              <Button onPress={() => setFlow("expo")} accessibilityLabel="Emulate a remote notification">
                <Icon as={Send} />
                <Text>Emulate Remote Notification</Text>
              </Button>
              <Button variant="outline" onPress={printToken} accessibilityLabel="Print the Expo push token">
                <Icon as={KeyRound} />
                <Text>Print Expo Push Token</Text>
              </Button>
              <Text className="text-center text-xs text-muted-foreground">
                Remote delivery runs through Expo. Printing the token lets you push to this device from your
                own API.
              </Text>
            </View>
          )}

          {/* option 1: full Expo flow + optional time selector */}
          {flow === "expo" && (
            <View className="gap-4">
              <Text className="text-center text-sm text-muted-foreground">
                Sends a push to this device through Expo, emulating a real remote notification.
              </Text>

              {/* optional time selector */}
              <View className="flex-row items-center justify-between">
                <Text>Schedule for a specific time</Text>
                <Switch checked={schedule} onCheckedChange={setSchedule} />
              </View>

              {schedule && (
                <View className="items-center gap-2">
                  {Platform.OS === "android" ? (
                    <Button
                      variant="outline"
                      onPress={() => setAndroidPicker(true)}
                      accessibilityLabel="Set the notification time">
                      <Text>
                        {fireDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </Text>
                    </Button>
                  ) : (
                    <DateTimePicker
                      key="debug-fire-time"
                      value={fireDate}
                      onValueChange={(_event, selectedDate) => setFireDate(selectedDate)}
                      mode="time"
                      display="compact"
                    />
                  )}

                  {Platform.OS === "android" && androidPicker && (
                    <DateTimePicker
                      key="debug-fire-time-android"
                      value={fireDate}
                      onValueChange={(_event, selectedDate) => {
                        setFireDate(selectedDate)
                        setAndroidPicker(false)
                      }}
                      onDismiss={() => setAndroidPicker(false)}
                      mode="time"
                    />
                  )}

                  <Text className="text-center text-xs text-muted-foreground">
                    If the chosen time has already passed, it is sent immediately.
                  </Text>
                </View>
              )}

              <View className="gap-3">
                <Button onPress={sendExpoNotification} disabled={busy}>
                  {busy ? <ActivityIndicator /> : <Icon as={Send} />}
                  <Text>{schedule ? "Schedule Notification" : "Send Notification"}</Text>
                </Button>
                <Button variant="ghost" onPress={() => setFlow(null)} disabled={busy}>
                  <Text>Back</Text>
                </Button>
              </View>
            </View>
          )}

          {/* option 2: printed token */}
          {flow === "token" && (
            <View className="gap-4">
              {busy || !token ? (
                <View className="items-center gap-2 py-4">
                  <ActivityIndicator />
                  <Text className="text-sm text-muted-foreground">Requesting token…</Text>
                </View>
              ) : (
                <View className="gap-2">
                  <Text className="text-center text-sm text-muted-foreground">
                    Also printed to the console. Long-press to copy.
                  </Text>
                  <Text selectable className="text-center font-mono text-xs">
                    {token}
                  </Text>
                </View>
              )}
              <Button variant="outline" onPress={close}>
                <Text>Done</Text>
              </Button>
            </View>
          )}
        </View>
      </BottomSheet>
    </>
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
