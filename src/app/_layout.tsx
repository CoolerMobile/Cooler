import "../../global.css"
import { AppThemeProvider, useAppTheme } from "@/components/custom/theme"
import { NAV_THEME } from "@/lib/theme"
import { Stack, usePathname, type NativeStackNavigationOptions } from "expo-router"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { StatusBar } from "react-native"
import { FlipPrivacyProvider } from "@/lib/hooks/security/flip-privacy"
import { AppLock } from "@/components/custom/app-lock"
import { SettingsGitHub } from "@/components/custom/settings/github"
import { PortalHost } from "@rn-primitives/portal"
import { MainNotifications } from "@/components/custom/home/notifications"
import { MainAdd } from "@/components/custom/home/add"
import { NewServerSheet } from "@/components/custom/new-server"
import { useState } from "react"
import { useCoolifyMonitor } from "@/lib/hooks/data/coolify"
import { useDeploymentMonitor } from "@/lib/hooks/data/deployments"

const TAB_HEADER_OPTIONS: Record<string, NativeStackNavigationOptions> = {
  index: {
    title: "Cooler",
    headerLeft: () => <MainNotifications />,
    headerRight: () => <MainHeaderRight />,
  },
  deployments: {
    title: "Deployments",
    headerRight: undefined,
  },
  settings: {
    title: "Cooler",
    headerRight: () => <SettingsGitHub />,
  },
}

function MainHeaderRight() {
  const [newServerOpen, setNewServerOpen] = useState(false)

  return (
    <>
      <MainAdd onPress={() => setNewServerOpen(true)} />
      <NewServerSheet open={newServerOpen} onOpenChange={setNewServerOpen} />
    </>
  )
}

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
  useCoolifyMonitor()
  useDeploymentMonitor()

  // theme
  const { colorScheme } = useAppTheme()
  const theme = NAV_THEME[colorScheme]

  // root stack owns the header shared by the native tabs
  // keep its options in sync with the selected tab,
  // since the tabs navigator only owns the bar
  const pathname = usePathname()
  const selectedTab = pathname.split("/").filter(Boolean)[0] ?? "index"
  const tabHeaderOptions = TAB_HEADER_OPTIONS[selectedTab] ?? TAB_HEADER_OPTIONS.index

  // app
  return (
    <>
      <StatusBar barStyle={colorScheme === "dark" ? "light-content" : "dark-content"} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.background },
          headerShadowVisible: false,
        }}>
        <Stack.Screen name="(tabs)" options={tabHeaderOptions} />
      </Stack>
      <PortalHost />
    </>
  )
}
