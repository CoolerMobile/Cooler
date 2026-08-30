import { NativeTabs } from "expo-router/unstable-native-tabs"
import { useColorScheme } from "nativewind"

export default function TabsLayout() {
  const { colorScheme } = useColorScheme()
  const accentColor = colorScheme === "dark" ? "#e91e63" : "#008080"

  return (
    <NativeTabs iconColor={accentColor}>
      <NativeTabs.Trigger name="(deployments)">
        <NativeTabs.Trigger.Label>Deployments</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="cube.box.fill" md="package" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(overview)">
        <NativeTabs.Trigger.Label>Overview</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" md="dashboard" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(settings)">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape.2.fill" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
