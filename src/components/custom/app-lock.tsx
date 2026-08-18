import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useBiometrics } from "@/lib/hooks/security/biometrics";
import { useSettingsStore } from "@/lib/stores/settings";
import { BlurView } from "expo-blur";
import { LockKeyhole } from "lucide-react-native";
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

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

  useEffect(() => {
    enabled.current = appLockEnabled;
    hydrated.current = hasHydrated;
    authentication.current = authenticate;
  }, [appLockEnabled, authenticate, hasHydrated]);

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

      // enabling app lock is itself authenticated on the settings screen, so
      // that successful confirmation also unlocks the current foreground session
      // the next inactive/background transition will lock it
      setLockState(false);
    }
  }, [appLockEnabled, hasHydrated, requestUnlock, setLockState]);

  useEffect(() => {
    const handleInactive = () => {
      if (enabled.current) {
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
      if (next !== "active") {
        handleInactive();
      } else if (previous !== "active") {
        handleActive();
      }
    });

    // android can emit blur/focus while the activity still reports `active`
    // these event types do not exist on iOS's native RCTAppState emitter
    const blurSubscription =
      Platform.OS === "android"
        ? AppState.addEventListener("blur", handleInactive)
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
  const coverOpacity = useSharedValue(showCover ? 1 : 0);
  const [renderCover, setRenderCover] = useState(showCover);
  const removeCover = useCallback(() => setRenderCover(false), []);

  useEffect(() => {
    if (showCover) {
      // Lock immediately so protected content cannot appear in an app-switcher
      // snapshot. Only unlocking uses the softer animated transition.
      setRenderCover(true);
      coverOpacity.value = 1;
      return;
    }

    coverOpacity.value = withTiming(
      0,
      {
        duration: 280,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      },
      (finished) => {
        if (finished) runOnJS(removeCover)();
      },
    );
  }, [coverOpacity, removeCover, showCover]);

  const animatedCoverStyle = useAnimatedStyle(() => ({
    opacity: coverOpacity.value,
  }));

  return (
    <View style={styles.root}>
      <View
        accessibilityElementsHidden={showCover || renderCover}
        importantForAccessibility={
          showCover || renderCover ? "no-hide-descendants" : "auto"
        }
        style={styles.root}
      >
        {children}
      </View>

      {(showCover || renderCover) && (
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.cover,
            // The locking transition stays fully opaque from its first frame.
            !showCover && animatedCoverStyle,
          ]}
        >
          <BlurView
            blurMethod="dimezisBlurViewSdk31Plus"
            intensity={80}
            style={StyleSheet.absoluteFill}
            tint="default"
          />
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
        </Animated.View>
      )}
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
});
