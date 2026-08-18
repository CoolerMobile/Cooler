import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { migratingSecureStorage } from "@/lib/hooks/secure";
import type { Settings, SettingsState } from "@/lib/types/settings";

const toDate = (value: unknown, fallback: Date): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

export const DEFAULT_SETTINGS: Settings = {
  appLock: false,
  protectProductionActions: false,
  hideSensitiveValues: false,
  deploymentAlerts: true,
  backupAlerts: true,
  scheduledTaskAlerts: true,
  serverAlerts: true,
  quietFrom: new Date(),
  quietTo: new Date(),
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
      storage: createJSONStorage(() => migratingSecureStorage),
      partialize: ({ settings }) => ({ settings }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsState>;
        const persistedSettings = persisted.settings;

        return {
          ...currentState,
          settings: {
            ...currentState.settings,
            ...persistedSettings,
            // JSON persistence serializes Date values as ISO strings. Restore
            // them so native date/time pickers always receive Date instances.
            quietFrom: toDate(
              persistedSettings?.quietFrom,
              currentState.settings.quietFrom,
            ),
            quietTo: toDate(
              persistedSettings?.quietTo,
              currentState.settings.quietTo,
            ),
          },
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
