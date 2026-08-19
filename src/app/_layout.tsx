import "../../global.css";
import { AppThemeProvider, useAppTheme } from "@/components/custom/theme";
import { NAV_THEME } from "@/lib/theme";
import {
  Stack,
  usePathname,
  type NativeStackNavigationOptions,
} from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "react-native";
import { FlipPrivacyProvider } from "@/lib/hooks/security/flip-privacy";
import { AppLock } from "@/components/custom/app-lock";
import { SettingsGitHub } from "@/components/custom/settings/github";
import { PortalHost } from "@rn-primitives/portal";
import { MainNotifications } from "@/components/custom/home/notifications";

const TAB_HEADER_OPTIONS: Record<string, NativeStackNavigationOptions> = {
  index: {
    title: "Cooler",
    headerRight: () => <MainNotifications />,
  },
  deployments: {
    title: "Cooler",
    headerRight: undefined,
  },
  settings: {
    title: "Cooler",
    headerRight: () => <SettingsGitHub />,
  },
};

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
  );
}

function RootNavigator() {
  // theme
  const { colorScheme } = useAppTheme();
  const theme = NAV_THEME[colorScheme];

  // root stack owns the header shared by the native tabs
  // keep its options in sync with the selected tab,
  // since the tabs navigator only owns the bar
  const pathname = usePathname();
  const selectedTab = pathname.split("/").filter(Boolean)[0] ?? "index";
  const tabHeaderOptions =
    TAB_HEADER_OPTIONS[selectedTab] ?? TAB_HEADER_OPTIONS.index;

  // app
  return (
    <>
      <StatusBar
        barStyle={colorScheme === "dark" ? "light-content" : "dark-content"}
      />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.background },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={tabHeaderOptions} />
      </Stack>
      <PortalHost />
    </>
  );
}
