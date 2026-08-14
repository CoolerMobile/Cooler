import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Settings, SettingsState } from "@/lib/types/settings";

export const DEFAULT_SETTINGS: Settings = {
  appLock: false,
  protectProductionActions: false,
  hideSensitiveValues: false,
};

/**
 * persistent user preferences
 *
 * only the settings object is persisted
 *
 * actions and hydration state are recreated for every app session
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (setState, getState) => ({
      settings: { ...DEFAULT_SETTINGS },
      hasHydrated: false,
      get: (key) => getState().settings[key],
      set: (key, value) =>
        setState((state) => ({
          settings: {
            ...state.settings,
            [key]: value,
          },
        })),
      reset: () => setState({ settings: { ...DEFAULT_SETTINGS } }),
      setHasHydrated: (hasHydrated) => setState({ hasHydrated }),
    }),
    {
      name: "cooler-settings",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ settings }) => ({ settings }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsState>;

        return {
          ...currentState,
          settings: {
            ...currentState.settings,
            ...persisted.settings,
          },
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
