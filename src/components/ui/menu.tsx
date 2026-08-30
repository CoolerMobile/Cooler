import NativeMenuView, { type MenuComponentProps, type MenuComponentRef } from "@expo/ui/community/menu"
import { cloneElement, isValidElement, useImperativeHandle, useRef } from "react"
import { Platform, type GestureResponderEvent } from "react-native"

export type { MenuAction } from "@expo/ui/community/menu"

type TriggerProps = {
  disabled?: boolean
  onLongPress?: (event: GestureResponderEvent) => void
  onPress?: (event: GestureResponderEvent) => void
}

type Props = MenuComponentProps & { ref?: React.Ref<MenuComponentRef> }

/**
 * Cross-platform menu with an Android trigger bridge.
 *
 * Expo's Android MenuView wraps its trigger in a Pressable. When the trigger is
 * already a Pressable (as our icon buttons are), the inner control becomes the
 * responder and the wrapper never receives the press that opens the menu.
 */
export function MenuView({ ref, children, shouldOpenOnLongPress, ...props }: Props) {
  const nativeRef = useRef<MenuComponentRef>(null)

  useImperativeHandle(ref, () => ({
    show: () => nativeRef.current?.show(),
  }))

  let trigger = children

  if (Platform.OS === "android" && isValidElement<TriggerProps>(children) && !children.props.disabled) {
    trigger = shouldOpenOnLongPress
      ? cloneElement(children, {
          onLongPress: (event) => {
            children.props.onLongPress?.(event)
            nativeRef.current?.show()
          },
        })
      : cloneElement(children, {
          onPress: (event) => {
            children.props.onPress?.(event)
            nativeRef.current?.show()
          },
        })
  }

  return (
    <NativeMenuView {...props} ref={nativeRef} shouldOpenOnLongPress={shouldOpenOnLongPress}>
      {trigger}
    </NativeMenuView>
  )
}

export default MenuView
