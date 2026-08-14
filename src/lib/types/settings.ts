/**
 * user-configurable application settings
 *
 * type limited to serializable values because it is persisted to AsyncStorage
 */
export type Settings = {
  appLock: boolean;
  protectProductionActions: boolean;
  hideSensitiveValues: boolean;
};

export type SettingKey = keyof Settings;

export type SettingsState = {
  settings: Settings;
  hasHydrated: boolean;
  get: <Key extends SettingKey>(key: Key) => Settings[Key];
  set: <Key extends SettingKey>(key: Key, value: Settings[Key]) => void;
  reset: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
};
