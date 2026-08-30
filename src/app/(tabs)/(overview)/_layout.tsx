import { MainAdd } from "@/components/custom/home/add"
import { MainNotifications } from "@/components/custom/home/notifications"
import { NewServerSheet } from "@/components/custom/new-server"
import { useAppTheme } from "@/components/custom/theme"
import { NAV_THEME } from "@/lib/theme"
import { Stack } from "expo-router"
import { useState } from "react"

function OverviewHeaderRight() {
  const [newServerOpen, setNewServerOpen] = useState(false)

  return (
    <>
      <MainAdd onPress={() => setNewServerOpen(true)} />
      <NewServerSheet open={newServerOpen} onOpenChange={setNewServerOpen} />
    </>
  )
}

export default function OverviewLayout() {
  const { colorScheme } = useAppTheme()
  const theme = NAV_THEME[colorScheme]

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
      }}>
      <Stack.Screen
        name="index"
        options={{
          title: "Cooler",
          headerLeft: () => <MainNotifications />,
          headerRight: () => <OverviewHeaderRight />,
        }}
      />
    </Stack>
  )
}
