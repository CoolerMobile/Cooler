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
import { useSentry } from "@/lib/hooks/sentry"
import * as Sentry from "@sentry/react-native"

function RootLayout() {
  // sentry
  useSentry()

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

export default Sentry.wrap(RootLayout)
