import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import type { DeploymentStatus } from "@/lib/types/deployment"
import { CircleCheck, CircleX, Clock3 } from "lucide-react-native"
import { useEffect, useRef } from "react"
import { Animated, Easing, View } from "react-native"

export const STATUS_LABELS: Record<DeploymentStatus, string> = {
  queued: "Queued",
  running: "Deploying",
  success: "Success",
  failed: "Failed",
  cancelled: "Cancelled",
}

export function ActiveIndicator({ size = 18 }: { size?: number }) {
  const opacity = useRef(new Animated.Value(0.35)).current
  const scale = useRef(new Animated.Value(0.82)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.35,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.82,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    )
    animation.start()
    return () => animation.stop()
  }, [opacity, scale])

  return (
    <Animated.View
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        opacity,
        transform: [{ scale }],
      }}
      className="items-center justify-center bg-teal-600 dark:bg-pink-500">
      <View className="h-1.5 w-1.5 rounded-full bg-white" />
    </Animated.View>
  )
}

export function DeploymentStatusIcon({ status, size = 18 }: { status: DeploymentStatus; size?: number }) {
  if (status === "running") return <ActiveIndicator size={size} />
  if (status === "success") {
    return <Icon as={CircleCheck} size={size} className="text-emerald-600 dark:text-emerald-400" />
  }
  if (status === "failed") return <Icon as={CircleX} size={size} className="text-red-600 dark:text-red-400" />
  if (status === "cancelled") return <Icon as={CircleX} size={size} className="text-muted-foreground" />
  return <Icon as={Clock3} size={size} className="text-amber-600 dark:text-amber-400" />
}

export function StatusBadge({ status }: { status: DeploymentStatus }) {
  const className =
    status === "success"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "failed"
        ? "bg-red-500/10 text-red-700 dark:text-red-300"
        : status === "running"
          ? "bg-teal-500/10 text-teal-700 dark:bg-pink-500/10 dark:text-pink-300"
          : "bg-muted text-muted-foreground"

  return (
    <View
      accessible
      accessibilityLabel={`Status: ${STATUS_LABELS[status]}`}
      className={`rounded-full px-2.5 py-1 ${className}`}>
      <Text
        className={`text-xs font-semibold ${className
          .split(" ")
          .filter((value) => value.startsWith("text-"))
          .join(" ")}`}>
        {STATUS_LABELS[status]}
      </Text>
    </View>
  )
}
