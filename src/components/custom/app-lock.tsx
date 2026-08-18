import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  isBiometricAuthenticationInFlight,
  useBiometrics,
} from "@/lib/hooks/security/biometrics";
import { useSettingsStore } from "@/lib/stores/settings";
import { BlurView } from "expo-blur";
import * as ScreenCapture from "expo-screen-capture";
import { LockKeyhole } from "lucide-react-native";
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform, StyleSheet, View } from "react-native";

/**
 * keeps app content covered whenever app lock is enabled
 * and the app is not active
 *
 * the cover remains in place while authentication is shown and is
 * only removed after a successful authentication result
 */
export function AppLock({ children }: PropsWithChildren) {
  const appLockEnabled = useSettingsStore((state) => state.settings.appLock);
  const hasHydrated = useSettingsStore((state) => state.hasHydrated);
  const { authenticate } = useBiometrics();

  // start covered until persisted settings have loaded
  // to prevent one frame of protected content from appearing during a locked cold launch
  const [locked, setLocked] = useState(true);
  const lockedState = useRef(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [unlockFailed, setUnlockFailed] = useState(false);

  const appState = useRef(AppState.currentState);
  const enabled = useRef(appLockEnabled);
  const hydrated = useRef(hasHydrated);
  const authentication = useRef(authenticate);
  const authenticationInFlight = useRef(false);
  const successfulAuthentication = useRef(false);
  const initialized = useRef(false);
  const previousEnabled = useRef(appLockEnabled);
  const appSwitcherProtectionEnabled = useRef(false);

  useEffect(() => {
    enabled.current = appLockEnabled;
    hydrated.current = hasHydrated;
    authentication.current = authenticate;
  }, [appLockEnabled, authenticate, hasHydrated]);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    // This native overlay is attached above presented view controllers, so it
    // also protects SwiftUI sheets and system dialogs in app-switcher snapshots.
    const shouldProtect = !hasHydrated || appLockEnabled;
    if (appSwitcherProtectionEnabled.current === shouldProtect) return;

    appSwitcherProtectionEnabled.current = shouldProtect;
    const updateProtection = shouldProtect
      ? ScreenCapture.enableAppSwitcherProtectionAsync(0.8)
      : ScreenCapture.disableAppSwitcherProtectionAsync();

    void updateProtection.catch((error: unknown) => {
      appSwitcherProtectionEnabled.current = !shouldProtect;
      console.error("[security] app-switcher protection failed:", error);
    });
  }, [appLockEnabled, hasHydrated]);

  const setLockState = useCallback((nextLocked: boolean) => {
    // lifecycle events can arrive before React commits the corresponding state
    // update, so we keep a synchronous copy so a trailing focus event from the
    // biometric prompt cannot immediately lock an already-unlocked session
    lockedState.current = nextLocked;
    setLocked(nextLocked);
  }, []);

  const requestUnlock = useCallback(async () => {
    if (
      authenticationInFlight.current ||
      !hydrated.current ||
      !enabled.current ||
      appState.current !== "active"
    ) {
      return;
    }

    authenticationInFlight.current = true;
    setUnlockFailed(false);
    setAuthenticating(true);

    try {
      const result = await authentication.current({
        promptMessage: "Unlock Cooler",
        promptDescription: "Unlock with Biometrics",
      });

      if (result.success && enabled.current) {
        successfulAuthentication.current = true;

        if (appState.current === "active") {
          successfulAuthentication.current = false;
          setLockState(false);
        }
      } else if (enabled.current && appState.current === "active") {
        setUnlockFailed(true);
      }
    } catch {
      // authentication errors leave the privacy cover in place
      // the user can explicitly retry from the lock screen
      if (enabled.current && appState.current === "active") {
        setUnlockFailed(true);
      }
    } finally {
      authenticationInFlight.current = false;
      setAuthenticating(false);
    }
  }, [setLockState]);

  useEffect(() => {
    if (!hasHydrated) {
      setUnlockFailed(false);
      setLockState(true);
      return;
    }

    if (!initialized.current) {
      initialized.current = true;
      previousEnabled.current = appLockEnabled;

      if (appLockEnabled) {
        setUnlockFailed(false);
        setLockState(true);
        void requestUnlock();
      } else {
        setLockState(false);
      }

      return;
    }

    if (previousEnabled.current !== appLockEnabled) {
      previousEnabled.current = appLockEnabled;
      successfulAuthentication.current = false;
      setUnlockFailed(false);

      // Enabling app lock is itself authenticated on the settings screen, so
      // that confirmation keeps the current foreground session unlocked. If
      // the user actually left during the prompt, keep the app protected.
      setLockState(appLockEnabled && appState.current !== "active");
    }
  }, [appLockEnabled, hasHydrated, requestUnlock, setLockState]);

  useEffect(() => {
    const handleInactive = (allowDuringAuthentication = false) => {
      // Native biometric prompts briefly interrupt the app lifecycle. They are
      // already authorizing an in-app action, so they must not lock the current
      // session and trigger a second authentication when the app becomes active.
      if (
        enabled.current &&
        (allowDuringAuthentication || !isBiometricAuthenticationInFlight())
      ) {
        setUnlockFailed(false);
        setLockState(true);
      }
    };

    const handleActive = () => {
      if (
        !enabled.current ||
        !lockedState.current ||
        authenticationInFlight.current
      ) {
        return;
      }

      if (successfulAuthentication.current) {
        successfulAuthentication.current = false;
        setLockState(false);
        return;
      }

      void requestUnlock();
    };

    const stateSubscription = AppState.addEventListener("change", (next) => {
      const previous = appState.current;
      appState.current = next;

      // iOS enters `inactive` while its app switcher is visible, before the
      // app necessarily reaches `background`
      //
      // this covers content at either of those phases
      if (next === "background") {
        // A real background transition always locks, even if it happened while
        // a biometric prompt was visible.
        handleInactive(true);
      } else if (next === "inactive") {
        handleInactive();
      } else if (previous !== "active") {
        handleActive();
      }
    });

    // android can emit blur/focus while the activity still reports `active`
    // these event types do not exist on iOS's native RCTAppState emitter
    const blurSubscription =
      Platform.OS === "android"
        ? AppState.addEventListener("blur", () => handleInactive())
        : undefined;
    const focusSubscription =
      Platform.OS === "android"
        ? AppState.addEventListener("focus", handleActive)
        : undefined;

    return () => {
      stateSubscription.remove();
      blurSubscription?.remove();
      focusSubscription?.remove();
    };
  }, [requestUnlock, setLockState]);

  const showCover = !hasHydrated || (appLockEnabled && locked);

  return (
    <View style={styles.root}>
      <View
        accessibilityElementsHidden={showCover}
        importantForAccessibility={
          showCover ? "no-hide-descendants" : "auto"
        }
        style={styles.root}
      >
        {children}
      </View>

      <View
        accessibilityViewIsModal={showCover}
        pointerEvents={showCover ? "auto" : "none"}
        style={[styles.cover, !showCover && styles.hiddenCover]}
      >
        {Platform.OS === "android" ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.androidPrivacyCover]}
          />
        ) : (
          showCover && (
            <BlurView
              intensity={80}
              style={StyleSheet.absoluteFill}
              tint="default"
            />
          )
        )}
        <View
          className="items-center justify-center gap-5 px-8"
          style={styles.content}
        >
          {unlockFailed && AppState.currentState === "active" && (
            <>
              <View className="bg-muted h-16 w-16 items-center justify-center rounded-full">
                <Icon
                  as={LockKeyhole}
                  className="text-muted-foreground"
                  size={30}
                />
              </View>
              <View className="items-center gap-1">
                <Text variant="h4">Cooler is locked</Text>
                <Text className="text-muted-foreground text-center">
                  Authenticate to view your app contents.
                </Text>
              </View>
              <Button
                accessibilityLabel="Unlock Cooler"
                disabled={authenticating}
                onPress={() => void requestUnlock()}
              >
                <Text>{authenticating ? "Unlocking…" : "Unlock"}</Text>
              </Button>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  cover: {
    bottom: 0,
    elevation: 1000,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1000,
  },
  content: {
    flex: 1,
  },
  hiddenCover: {
    opacity: 0,
  },
  androidPrivacyCover: {
    // BlurTargetView cannot host the app's native stack/tab surfaces safely.
    // Keep Android fully private instead of leaking content through a tint.
    backgroundColor: "rgb(115, 115, 115)",
  },
});
