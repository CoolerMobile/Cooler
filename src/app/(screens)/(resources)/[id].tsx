import { useScreenOptions } from "@/lib/hooks/screen-options"
import { Resource } from "@/lib/types/coolify"
import { Stack } from "expo-router"
import { View } from "react-native"

type Props = {
  resource: Resource
}

export default function ResourceScreen({ resource }: Props) {
  // screen options
  const { options } = useScreenOptions()

  // screen
  return (
    <>
      <Stack.Screen
        options={options({
          title: `${resource.name}`,
        })}
      />
    </>
  )
}
