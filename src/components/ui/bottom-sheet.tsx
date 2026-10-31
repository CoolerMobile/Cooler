import ExpoBottomSheet, { BottomSheetTextInput, type BottomSheetProps } from "@expo/ui/community/bottom-sheet"
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const PERCENTAGE_SNAP_POINT = /^(\d+(?:\.\d+)?)%$/

function resolveSnapPoint(snapPoint: string | number | undefined, windowHeight: number) {
  if (typeof snapPoint === "number") {
    return snapPoint
  }

  const percentage = snapPoint?.match(PERCENTAGE_SNAP_POINT)
  if (!percentage) {
    return undefined
  }

  return (windowHeight * Number(percentage[1])) / 100
}

/**
 * Keeps Expo's native iOS sheet detents while giving Android single-point
 * sheets their requested height. Material 3 only exposes partial (~50%) and
 * expanded states, so @expo/ui otherwise maps a single snap point to full
 * height regardless of its value.
 */
export function BottomSheet({ children, index = 0, snapPoints, ...props }: BottomSheetProps) {
  const { height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  // match the native iOS detent, which measures the fraction from below the
  // top safe area rather than the full edge-to-edge window android reports
  const availableHeight = windowHeight - insets.top

  if (Platform.OS !== "android" || snapPoints?.length !== 1) {
    return (
      <ExpoBottomSheet {...props} index={index} snapPoints={snapPoints}>
        <View style={styles.measure}>{children}</View>
      </ExpoBottomSheet>
    )
  }

  const requestedHeight = resolveSnapPoint(snapPoints[0], availableHeight)

  if (requestedHeight === undefined) {
    return (
      <ExpoBottomSheet {...props} index={index} snapPoints={snapPoints}>
        {children}
      </ExpoBottomSheet>
    )
  }

  return (
    <ExpoBottomSheet
      {...props}
      index={index}
      snapPoints={undefined}
      enableDynamicSizing
      handleComponent={null}>
      <View style={[styles.androidSheet, { height: Math.min(Math.max(requestedHeight, 1), availableHeight) }]}>
        <View style={styles.androidHandleContainer} pointerEvents="none">
          <View className="h-1 w-8 rounded-full bg-muted-foreground" />
        </View>
        <View style={styles.androidContent}>{children}</View>
      </View>
    </ExpoBottomSheet>
  )
}

const styles = StyleSheet.create({
  measure: {
    flex: 1,
  },
  androidSheet: {
    width: "100%",
  },
  androidHandleContainer: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
  },
  androidContent: {
    flex: 1,
  },
})

export default BottomSheet
export { BottomSheetTextInput }
