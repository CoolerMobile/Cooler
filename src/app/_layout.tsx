import "../../global.css";
import {
  AppThemeProvider,
  ThemeToggle,
  useAppTheme,
} from "@/components/custom/theme";
import { NAV_THEME } from "@/lib/theme";
import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { useEffect } from "react";
import { FlipPrivacyProvider } from "@/lib/hooks/security/flip-privacy";
import { useNotifications } from "@/lib/hooks/notifications";
import { AppLock } from "@/components/custom/app-lock";

export default function RootLayout() {
  // notifications
  const { registerDevice } = useNotifications();

  // register notifications once at the app root
  // only if in production environment
  if (process.env.NODE_ENV === "production") {
    useEffect(() => {
      void registerDevice()
        .then((token) => {
          if (!token) {
            console.warn(
              "[notif] registration skipped: notification permission was not granted",
            );
          }
        })
        .catch((error) => {
          console.error("[notif] registration failed:", error);
        });
    }, []);
  } else {
    // development environment - skip eas registration
    console.info("[eas] dev env: skipping registration");
  }

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
