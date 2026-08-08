import {
  getSavedColorScheme,
  NAV_THEME,
  saveColorScheme,
  type ColorSchemePreference,
} from "@/lib/theme";
import { ThemeProvider } from "expo-router";
import { Monitor, Moon, Sun } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useColorScheme as useSystemColorScheme } from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

type ResolvedColorScheme = "light" | "dark";

type AppThemeContextValue = {
  colorScheme: ResolvedColorScheme;
  colorSchemePreference: ColorSchemePreference;
  setColorScheme: (colorScheme: ColorSchemePreference) => Promise<void>;
  toggleColorScheme: () => Promise<void>;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const { setColorScheme: setNativeColorScheme } = useColorScheme();
  const systemColorScheme = useSystemColorScheme();
  const [colorScheme, setColorSchemeState] =
    useState<ColorSchemePreference | null>(null);
  const appliedNativeColorScheme = useRef<ColorSchemePreference | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getSavedColorScheme().then((savedColorScheme) => {
      const initialColorScheme = savedColorScheme ?? "system";

      if (isMounted) {
        setColorSchemeState(initialColorScheme);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!colorScheme || appliedNativeColorScheme.current === colorScheme) {
      return;
    }

    // NativeWind notifies all className subscribers synchronously. Deferring
    // that global update until after React commits prevents it from updating a
    // screen while the navigator is mounting it for the new theme.
    setNativeColorScheme(colorScheme);
    appliedNativeColorScheme.current = colorScheme;
  }, [colorScheme, setNativeColorScheme]);

  const setColorScheme = useCallback(
    async (nextColorScheme: ColorSchemePreference) => {
      // Commit to storage before changing the UI, so the active theme and saved
      // preference cannot get out of sync.
      await saveColorScheme(nextColorScheme);
      setColorSchemeState(nextColorScheme);
    },
    [],
  );

  const toggleColorScheme = useCallback(async () => {
    const nextColorScheme: ColorSchemePreference =
      colorScheme === "light"
        ? "dark"
        : colorScheme === "dark"
          ? "system"
          : "light";
    await setColorScheme(nextColorScheme);
  }, [colorScheme, setColorScheme]);

  // This hook subscribes to OS appearance changes, allowing system mode to
  // update Expo Router and the status bar as soon as the system theme changes.
  const resolvedColorScheme: ResolvedColorScheme =
    colorScheme === "dark"
      ? "dark"
      : colorScheme === "light"
        ? "light"
        : systemColorScheme === "dark"
          ? "dark"
          : "light";

  const value = useMemo<AppThemeContextValue | null>(() => {
    if (!colorScheme) {
      return null;
    }

    return {
      colorScheme: resolvedColorScheme,
      colorSchemePreference: colorScheme,
      setColorScheme,
      toggleColorScheme,
    };
  }, [colorScheme, resolvedColorScheme, setColorScheme, toggleColorScheme]);

  if (!value) {
    return null;
  }

  return (
    <AppThemeContext.Provider value={value}>
      <ThemeProvider value={NAV_THEME[value.colorScheme]}>
        {children}
      </ThemeProvider>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const theme = useContext(AppThemeContext);

  if (!theme) {
    throw new Error("useAppTheme must be used within AppThemeProvider");
  }

  return theme;
}

export const ThemeToggle = () => {
  const { colorScheme, colorSchemePreference, toggleColorScheme } =
    useAppTheme();

  const icon =
    colorSchemePreference === "system"
      ? Monitor
      : colorScheme === "dark"
        ? Moon
        : Sun;

  return (
    <Button
      variant="ghost"
      accessibilityLabel={`Current theme: ${colorSchemePreference}`}
      onPress={() => {
        void toggleColorScheme().catch(() => undefined);
      }}
    >
      <Icon as={icon} />
    </Button>
  );
};
