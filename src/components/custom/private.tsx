import { BlurView } from "expo-blur";
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type PrivateValueProps = PropsWithChildren<{
  hidden: boolean;
}>;

export const PrivateValue = ({ hidden, children }: PrivateValueProps) => {
  const privacyProgress = useSharedValue(hidden ? 1 : 0);
  const [renderBlur, setRenderBlur] = useState(hidden);
  const removeBlur = useCallback(() => setRenderBlur(false), []);

  useEffect(() => {
    if (hidden) setRenderBlur(true);

    privacyProgress.value = withTiming(
      hidden ? 1 : 0,
      {
        duration: hidden ? 120 : 160,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      },
      (finished) => {
        if (finished && !hidden) runOnJS(removeBlur)();
      },
    );
  }, [hidden, privacyProgress, removeBlur]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: privacyProgress.value,
  }));

  return (
    <View
      accessible={hidden}
      accessibilityLabel={hidden ? "Hidden value" : undefined}
      style={styles.container}
    >
      <View
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>

      {renderBlur && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, animatedStyle]}
        >
          {Platform.OS === "android" ? (
            <View
              style={[StyleSheet.absoluteFill, styles.androidPrivacyCover]}
            />
          ) : (
            <BlurView
              intensity={80}
              tint="default"
              style={[StyleSheet.absoluteFill, styles.blur]}
            />
          )}
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  blur: {
    borderRadius: 4,
  },
  androidPrivacyCover: {
    backgroundColor: "rgb(115, 115, 115)",
    borderRadius: 4,
  },
});
