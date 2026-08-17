import { useSecureStorage } from "@/lib/hooks/secure";
import "../../global.css";
import {
  AppThemeProvider,
  ThemeToggle,
  useAppTheme,
} from "@/components/custom/theme";
import { NAV_THEME } from "@/lib/theme";
import { Stack } from "expo-router";
import { StatusBar, AppState, type AppStateStatus } from "react-native";
import { useEffect, useRef } from "react";
import { useBiometrics } from "@/lib/hooks/security/biometrics";
import { FlipPrivacyProvider } from "@/lib/hooks/security/flip-privacy";

export default function RootLayout() {
  // validate auth
  const { get } = useSecureStorage();
  const { authenticate } = useBiometrics();
  const authEnabled = get("appLock");

  // check app state
  const appState = useRef(AppState.currentState);

  // request auth on app launch if enabled
  useEffect(() => {
    if (authEnabled as unknown as boolean) {
      authenticate({
        promptMessage: "Unlock with Biometrics",
      });
    }
  }, [authEnabled]);

  // request auth on return from background
  const wasBackgrounded = useRef(false);
  useEffect(() => {
    if (!authEnabled) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        wasBackgrounded.current = true;
      }

      if (state === "active" && wasBackgrounded.current) {
        wasBackgrounded.current = false;

        authenticate({
          promptMessage: "Unlock with Biometrics",
        });
      }
    });

    return () => subscription.remove();
  }, [authEnabled]);

  // return navigator
  return (
    <AppThemeProvider>
      <FlipPrivacyProvider>
        <RootNavigator />
      </FlipPrivacyProvider>
    </AppThemeProvider>
  );
}

function RootNavigator() {
  const { colorScheme } = useAppTheme();
  const theme = NAV_THEME[colorScheme];

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
