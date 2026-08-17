import { Accelerometer } from "expo-sensors";
import {
  createContext,
  createElement,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { PrivacyGestureDetector } from "@/lib/security/privacy-gesture";
import { useSettingsStore } from "@/lib/stores/settings";

const SENSOR_INTERVAL_MS = 40;

type FlipPrivacyContextValue = {
  isHidden: boolean;
  hide: () => void;
  show: () => void;
  toggle: () => void;
};

const FlipPrivacyContext = createContext<FlipPrivacyContextValue | null>(null);

export function FlipPrivacyProvider({ children }: PropsWithChildren) {
  const [isHidden, setIsHidden] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState,
  );

  const enabled = useSettingsStore(
    (state) => state.hasHydrated && state.settings.hideSensitiveValues,
  );

  const hide = useCallback(() => setIsHidden(true), []);
  const show = useCallback(() => setIsHidden(false), []);
  const toggle = useCallback(
    () => setIsHidden((current) => !current),
    [],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (enabled) return;
    show();
  }, [enabled, show]);

  useEffect(() => {
    if (!enabled || appState !== "active") return;

    let subscription: ReturnType<typeof Accelerometer.addListener> | null =
      null;
    let cancelled = false;

    // Core Motion and Android use opposite signs for the device's z axis.
    const faceDownSign: 1 | -1 = Platform.OS === "ios" ? 1 : -1;
    const detector = new PrivacyGestureDetector({
      faceDownSign,
      onGesture: toggle,
    });

    void Accelerometer.isAvailableAsync()
      .then((isAvailable) => {
        if (!isAvailable || cancelled) return;

        Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
        subscription = Accelerometer.addListener((sample) => {
          detector.process(sample);
        });
      })
      .catch(() => {
        // A missing or unavailable sensor should never interrupt the app.
      });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [appState, enabled, toggle]);

  const value = useMemo<FlipPrivacyContextValue>(
    () => ({ isHidden, hide, show, toggle }),
    [hide, isHidden, show, toggle],
  );

  return createElement(FlipPrivacyContext.Provider, { value }, children);
}

export function useFlipPrivacy() {
  const privacy = useContext(FlipPrivacyContext);

  if (!privacy) {
    throw new Error("useFlipPrivacy must be used within FlipPrivacyProvider");
  }

  return privacy;
}
