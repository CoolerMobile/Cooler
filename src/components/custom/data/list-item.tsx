import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"
import { ChevronRight, CircleQuestionMark, LucideIcon } from "lucide-react-native"
import { ReactElement, useRef } from "react"
import { Pressable, View } from "react-native"
import Spacer from "@/components/custom/spacer"
import ReanimatedSwipeable, { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable"
import { Button } from "@/components/ui/button"

export type SwipeAction = {
  variant: "destructive" | "default"
  icon: LucideIcon
  accessibilityLabel?: string
  side?: "left" | "right"
  onPress: () => void
}

type ListItemProps = {
  className?: string
  title?: string
  description?: string
  leading?: ReactElement
  trailing?: ReactElement
  onPress?: () => void
  swipeActions?: SwipeAction[]
  swipeableKey?: string | number
  onSwipeOpenChange?: (isOpen: boolean) => void
}

export const ListItem = ({
  className,
  title = "No Title",
  description,
  leading = <Icon as={CircleQuestionMark} size={24} />,
  trailing,
  onPress,
  swipeActions,
  swipeableKey,
  onSwipeOpenChange,
}: ListItemProps) => {
  // swipe ref
  const swipeRef = useRef<SwipeableMethods>(null)
  const isSwipeClosedRef = useRef(true)
  const pendingRowPressRef = useRef<(() => void) | null>(null)
  const pendingSwipeActionRef = useRef<(() => void) | null>(null)

  const handlePress = () => {
    // Some Android gesture paths also deliver the release to the row under a
    // swipe action. Do not let that press replace the selected action.
    if (pendingSwipeActionRef.current) return

    if (isSwipeClosedRef.current) {
      onPress?.()
      return
    }

    pendingRowPressRef.current = onPress ?? null
    swipeRef.current?.close()
  }

  const handleSwipeOpen = () => {
    isSwipeClosedRef.current = false
    onSwipeOpenChange?.(true)
  }

  const handleSwipeClose = () => {
    isSwipeClosedRef.current = true
    onSwipeOpenChange?.(false)

    if (pendingSwipeActionRef.current) {
      const pendingAction = pendingSwipeActionRef.current
      pendingSwipeActionRef.current = null
      pendingRowPressRef.current = null
      pendingAction()
    } else if (pendingRowPressRef.current) {
      const pendingPress = pendingRowPressRef.current
      pendingRowPressRef.current = null
      pendingPress()
    }
  }

  const handleSwipeAction = (action: SwipeAction) => {
    // On Android, presenting a sheet while the swipeable action surface is
    // still open can be ignored by the native modal host. Finish closing the
    // row first, then run the action from onSwipeableClose.
    pendingSwipeActionRef.current = action.onPress
    swipeRef.current?.close()
  }

  // swipe actions
  const leftActions = swipeActions?.filter((action) => action.side === "left") ?? []
  const rightActions = swipeActions?.filter((action) => action.side !== "left") ?? []
  const hasActions = leftActions.length > 0 || rightActions.length > 0

  // item
  return (
    <ReanimatedSwipeable
      key={swipeableKey}
      enabled={hasActions}
      ref={swipeRef}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={
        leftActions.length > 0
          ? () => <SwipeActionsView actions={leftActions} side="left" onActionPress={handleSwipeAction} />
          : undefined
      }
      renderRightActions={
        rightActions.length > 0
          ? () => <SwipeActionsView actions={rightActions} side="right" onActionPress={handleSwipeAction} />
          : undefined
      }
      onSwipeableWillOpen={handleSwipeOpen}
      onSwipeableClose={handleSwipeClose}>
      <Pressable onPress={handlePress} className={cn("px-4 py-2", className)}>
        <Card className="p-0">
          <CardContent>
            <View className="flex flex-row items-center py-5">
              {/* leading */}
              <View className="p-0">{leading}</View>

              {/* title and description */}
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
              </CardHeader>

              <Spacer />

              {/* trailing */}
              <View className="p-0">{trailing}</View>
            </View>
          </CardContent>
        </Card>
      </Pressable>
    </ReanimatedSwipeable>
  )
}

const SwipeActionsView = ({
  actions,
  side,
  onActionPress,
}: {
  actions: SwipeAction[]
  side: "left" | "right"
  onActionPress: (action: SwipeAction) => void
}) => (
  <View className="flex-row">
    {actions.map((action, index) => (
      <View
        key={`${action.variant}-${index}`}
        className={cn("justify-center", side === "left" ? "items-start pl-4" : "items-end pr-4")}
        style={{ width: 82 }}>
        <Button
          className="h-14"
          variant={action.variant}
          accessibilityLabel={action.accessibilityLabel}
          onPress={() => onActionPress(action)}>
          <Icon as={action.icon} />
        </Button>
      </View>
    ))}
  </View>
)
