import { PrivateValue } from "@/components/custom/private"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Separator } from "@/components/ui/separator"
import { Text } from "@/components/ui/text"
import { Icon as ExpoIcon } from "@expo/ui"
import { useScreenOptions } from "@/lib/hooks/screen-options"
import { useFlipPrivacy } from "@/lib/hooks/security/flip-privacy"
import { useDataStore } from "@/lib/stores/data"
import type { Resource } from "@/lib/types/coolify"
import { upperFirstLetter } from "@/lib/utils"
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect"
import { router, Stack, useLocalSearchParams } from "expo-router"
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Component,
  Ellipsis,
  Library,
  Logs,
  LucideIcon,
  Server,
} from "lucide-react-native"
import { Button as NativeButton, Platform, Pressable, ScrollView, View } from "react-native"
import MenuView, { MenuAction } from "@expo/ui/community/menu"
import { useState } from "react"

type DetailType = "servers" | "instances" | "resources"
type DetailState = "healthy" | "unhealthy" | "unknown"

const STATE_PRESENTATION = {
  healthy: {
    icon: CircleCheck,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    containerClassName: "bg-emerald-500/10",
  },
  unhealthy: {
    icon: CircleAlert,
    iconClassName: "text-red-600 dark:text-red-400",
    containerClassName: "bg-red-500/10",
  },
  unknown: {
    icon: CircleHelp,
    iconClassName: "text-muted-foreground",
    containerClassName: "bg-muted",
  },
} as const

export default function ResourceScreen() {
  const { options } = useScreenOptions()
  const { isHidden } = useFlipPrivacy()
  const { id, type } = useLocalSearchParams<{ id: string; type: DetailType }>()
  const servers = useDataStore((state) => state.servers)
  const instances = useDataStore((state) => state.instances)
  const resources = useDataStore((state) => state.resources)

  const item =
    type === "servers"
      ? servers.find((server) => server.id === id)
      : type === "instances"
        ? instances.find((instance) => instance.id === id)
        : resources.find((resource) => resource.id === id)

  const title = item ? ("nickname" in item ? item.nickname : item.name) : "Details"

  // actions menu icons
  const menuIcons = {
    start: ExpoIcon.select({
      ios: "play.fill",
      android: import("@expo/material-symbols/play_arrow.xml"),
    }),
    restart: ExpoIcon.select({
      ios: "arrow.clockwise",
      android: import("@expo/material-symbols/refresh.xml"),
    }),
    stop: ExpoIcon.select({
      ios: "stop.fill",
      android: import("@expo/material-symbols/stop.xml"),
    }),
  }

  // screen
  return (
    <>
      <Stack.Screen
        options={options({
          title: isHidden ? "Details" : title,
          headerBackButtonDisplayMode: "minimal",
          headerRight: () => (
            <ActionMenu
              resourceId={item?.id ?? ""}
              actions={[
                {
                  id: "start",
                  image: menuIcons.start,
                  title: "Start",
                },
                {
                  id: "restart",
                  image: menuIcons.restart,
                  title: "Restart",
                },
                {
                  id: "stop",
                  image: menuIcons.stop,
                  title: "Stop",
                },
              ]}
            />
          ),
        })}
      />

      {!item ? (
        <View className="flex-1 items-center justify-center gap-2 p-6">
          <Text className="text-lg font-semibold">Item not found</Text>
          <Text className="text-center text-muted-foreground">
            This item may have been removed during the latest refresh.
          </Text>
        </View>
      ) : (
        <View className="flex-1 gap-4 p-4">
          {type === "servers" && "nickname" in item ? (
            <>
              <DetailHeader
                icon={Server}
                title={item.nickname}
                subtitle="Coolify connection"
                state={item.health === "ok" ? "healthy" : item.health === "unknown" ? "unknown" : "unhealthy"}
                status={item.health === "ok" ? "Healthy" : upperFirstLetter(item.health.replaceAll("_", " "))}
                hidden={isHidden}
              />
              <DetailCard
                rows={[
                  ["Endpoint", item.endpoint],
                  ["Version", item.version || "Unknown"],
                  ["Connection ID", item.id],
                ]}
                hidden={isHidden}
              />
            </>
          ) : type === "instances" && "isReachable" in item && !("status" in item) ? (
            <>
              <DetailHeader
                icon={Component}
                title={item.name}
                subtitle={item.description || "Deployment target"}
                state={item.isReachable ? "healthy" : "unhealthy"}
                status={item.isReachable ? "Reachable" : "Unreachable"}
                hidden={isHidden}
              />
              <DetailCard
                rows={[
                  ["UUID", item.uuid],
                  ["Connection ID", item.connectionId],
                  ["Instance ID", item.id],
                ]}
                hidden={isHidden}
              />
            </>
          ) : "status" in item ? (
            <>
              <DetailHeader
                icon={Library}
                title={item.name}
                subtitle={upperFirstLetter(item.type)}
                state={
                  item.status === "running" ? "healthy" : item.status === "unknown" ? "unknown" : "unhealthy"
                }
                status={upperFirstLetter(item.status)}
                hidden={isHidden}
              />
              <DetailCard
                rows={[
                  ["Reported status", item.rawStatus],
                  ["Reachability", item.isReachable ? "Reachable" : "Unreachable"],
                  ["UUID", item.uuid],
                  ["Instance ID", item.instanceId],
                  ["Connection ID", item.connectionId],
                ]}
                hidden={isHidden}
                resource={item}
              />
            </>
          ) : null}
        </View>
      )}
    </>
  )
}

const ActionMenu = ({ resourceId, actions }: { resourceId: string; actions: MenuAction[] }) => {
  // restart state
  const [isRestarting, setIsRestarting] = useState(false)

  // menu
  return (
    <MenuView
      onPressAction={({ nativeEvent }) => {
        const action = nativeEvent.event
      }}
      actions={actions.map((action) => action)}>
      <Button variant="ghost" accessibilityLabel="More list options">
        <Icon as={Ellipsis} />
      </Button>
    </MenuView>
  )
}

const DetailHeader = ({
  icon,
  title,
  subtitle,
  state,
  status,
  hidden,
}: {
  icon: typeof Server
  title: string
  subtitle: string
  state: DetailState
  status: string
  hidden: boolean
}) => {
  const presentation = STATE_PRESENTATION[state]

  return (
    <Card>
      <CardContent className="flex-row items-center gap-4 py-1">
        <View
          className={`h-12 w-12 items-center justify-center rounded-full ${presentation.containerClassName}`}>
          <Icon as={icon} size={24} className={presentation.iconClassName} />
        </View>
        <View className="flex-1 gap-1">
          <PrivateValue hidden={hidden}>
            <Text className="text-xl font-semibold">{title}</Text>
          </PrivateValue>
          <PrivateValue hidden={hidden}>
            <Text className="text-muted-foreground">{subtitle}</Text>
          </PrivateValue>
        </View>
        <PrivateValue hidden={hidden}>
          <View accessible accessibilityLabel={status} className="p-2">
            <Icon as={presentation.icon} size={24} className={presentation.iconClassName} />
          </View>
        </PrivateValue>
      </CardContent>
    </Card>
  )
}

const DetailCard = ({
  rows,
  hidden,
  resource,
}: {
  rows: [string, string][]
  hidden: boolean
  resource?: Resource
}) => {
  return (
    <View className="min-h-0 flex-1 gap-4">
      {/* details */}
      <ScrollView className="flex-1" alwaysBounceVertical={false} showsVerticalScrollIndicator={false}>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.map(([label, value], index) => (
              <View key={label}>
                {index > 0 && <Separator />}
                <View className="gap-1 py-4">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </Text>
                  <PrivateValue hidden={hidden}>
                    <Text selectable>{value}</Text>
                  </PrivateValue>
                </View>
              </View>
            ))}
          </CardContent>
        </Card>
      </ScrollView>

      {/* logs */}
      {resource && <ResourceLogsButton resource={resource} />}
    </View>
  )
}

const ResourceLogsButton = ({ resource }: { resource: Resource }) => {
  const openLogs = () => {
    router.push({
      pathname: "/logs/[id]",
      params: {
        id: resource.id,
        uuid: resource.uuid,
        name: resource.name,
        type: resource.type,
        connectionId: resource.connectionId,
        instanceId: resource.instanceId,
      },
    })
  }

  const supportsLiquidGlass = Platform.OS === "ios" && isGlassEffectAPIAvailable() && isLiquidGlassAvailable()

  return (
    <View className="p-8">
      {supportsLiquidGlass ? (
        <GlassView
          glassEffectStyle="regular"
          isInteractive
          style={{ width: "100%", height: 48, borderRadius: 24, overflow: "hidden" }}>
          <Pressable
            accessibilityRole="button"
            className="flex h-full w-full flex-row items-center justify-center gap-2 active:opacity-70"
            onPress={openLogs}>
            <Icon as={Logs} />
            <Text className="text-sm font-semibold">Logs</Text>
          </Pressable>
        </GlassView>
      ) : (
        <NativeButton title="Logs" onPress={openLogs} />
      )}
    </View>
  )
}
