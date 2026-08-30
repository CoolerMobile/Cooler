import { useAppTheme } from "@/components/custom/theme"
import { NAV_THEME } from "@/lib/theme"
import { Stack } from "expo-router"

export default function DeploymentsLayout() {
  const { colorScheme } = useAppTheme()
  const theme = NAV_THEME[colorScheme]

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="deployments" options={{ title: "Deployments" }} />
    </Stack>
  )
}
