import "../../global.css";
import { AppThemeProvider, ThemeToggle, useAppTheme } from "@/components/custom/theme";
import { NAV_THEME } from "@/lib/theme";
import { Stack } from "expo-router";
import { StatusBar } from "react-native";

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <RootNavigator />
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
