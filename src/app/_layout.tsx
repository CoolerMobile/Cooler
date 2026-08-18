import "../../global.css";
import {
  AppThemeProvider,
  ThemeToggle,
  useAppTheme,
} from "@/components/custom/theme";
import { NAV_THEME } from "@/lib/theme";
import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { FlipPrivacyProvider } from "@/lib/hooks/security/flip-privacy";
import { AppLock } from "@/components/custom/app-lock";

export default function RootLayout() {
  // return navigator
  return (
    <AppThemeProvider>
      <AppLock>
        <FlipPrivacyProvider>
          <RootNavigator />
        </FlipPrivacyProvider>
      </AppLock>
    </AppThemeProvider>
  );
}

function RootNavigator() {
  // theme
  const { colorScheme } = useAppTheme();
  const theme = NAV_THEME[colorScheme];

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
          headerRight: () => <ThemeToggle />,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ title: "Cooler" }} />
      </Stack>
    </>
  );
}
