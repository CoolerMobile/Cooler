import "../../global.css"
import { AppThemeProvider, useAppTheme } from "@/components/custom/theme"
import { NAV_THEME } from "@/lib/theme"
import { Stack } from "expo-router"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { StatusBar } from "react-native"
import { FlipPrivacyProvider } from "@/lib/hooks/security/flip-privacy"
import { AppLock } from "@/components/custom/app-lock"
import { PortalHost } from "@rn-primitives/portal"
import { useCoolifyMonitor } from "@/lib/hooks/data/coolify"
import { useDeploymentMonitor } from "@/lib/hooks/data/deployments"
import { useDeploymentBackgroundTask } from "@/lib/tasks/deployment-monitor"
import * as Sentry from "@sentry/react-native"

export default function RootLayout() {
  // return navigator
  return (
    <GestureHandlerRootView>
      <AppThemeProvider>
        <AppLock>
          <FlipPrivacyProvider>
            <RootNavigator />
          </FlipPrivacyProvider>
        </AppLock>
      </AppThemeProvider>
    </GestureHandlerRootView>
  )
}

function RootNavigator() {
  // sentry
  Sentry.init({
    dsn: "https://b891bc92b50d4ac1934b43b74fdef846@tracking.danfq.dev/1",
    environment: __DEV__ ? "development" : "production",
    tracesSampleRate: 0.01,
    enableAutoSessionTracking: true,
    enableNative: true,
    attachStacktrace: true,
    attachScreenshot: true,
    attachViewHierarchy: true,
    sendDefaultPii: false,
  })

  // sentry test
  Sentry.captureException(new Error("test with more info"))

  // monitors & background tasks
  useCoolifyMonitor()
  useDeploymentMonitor()
  useDeploymentBackgroundTask()

  // theme
  const { colorScheme } = useAppTheme()
  const theme = NAV_THEME[colorScheme]

  // app
  return (
    <>
      <StatusBar barStyle={colorScheme === "dark" ? "light-content" : "dark-content"} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.background },
          headerShadowVisible: false,
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <PortalHost />
    </>
  )
}
