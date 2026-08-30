import { PrivateValue } from "@/components/custom/private"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import MenuView, { MenuAction } from "@/components/ui/menu"
import { Separator } from "@/components/ui/separator"
import { Text } from "@/components/ui/text"
import { Icon as ExpoIcon } from "@expo/ui"
import {
  canRequestCoolifyResourceAction,
  coolifyResourceActionErrorMessage,
  refreshCoolifyResourceAfterAction,
  requestCoolifyResourceAction,
  supportsCoolifyResourceActions,
  type CoolifyResourceAction,
} from "@/lib/hooks/data/coolify"
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
  Server,
} from "lucide-react-native"
import {
  ActivityIndicator,
  Button as NativeButton,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native"
import { useEffect, useRef, useState } from "react"

type DetailType = "servers" | "instances" | "resources"
type DetailState = "healthy" | "unhealthy" | "unknown"
type ResourceActionFeedbackPhase = "requesting" | "updating" | "accepted" | "complete" | "error"

type ResourceActionFeedback = {
  phase: ResourceActionFeedbackPhase
  title: string
  message: string
}

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
  const [pendingAction, setPendingAction] = useState<CoolifyResourceAction | null>(null)
  const [actionFeedback, setActionFeedback] = useState<ResourceActionFeedback | null>(null)
  const actionInFlight = useRef(false)
  const actionOperationId = useRef(0)
  const refreshController = useRef<AbortController | null>(null)

  const item =
    type === "servers"
      ? servers.find((server) => server.id === id)
      : type === "instances"
        ? instances.find((instance) => instance.id === id)
        : resources.find((resource) => resource.id === id)

  const title = item ? ("nickname" in item ? item.nickname : item.name) : "Details"
  const selectedResource = type === "resources" ? resources.find((resource) => resource.id === id) : undefined

  useEffect(() => {
    actionOperationId.current += 1
    actionInFlight.current = false
    refreshController.current?.abort()
    refreshController.current = null
    setPendingAction(null)
    setActionFeedback(null)

    return () => refreshController.current?.abort()
  }, [id])

  const performResourceAction = async (action: CoolifyResourceAction) => {
    if (
      actionInFlight.current ||
      !selectedResource ||
      !canRequestCoolifyResourceAction(selectedResource, action)
    ) {
      return
    }

    const operationId = ++actionOperationId.current
    const isCurrentOperation = () => actionOperationId.current === operationId
    actionInFlight.current = true
    setPendingAction(action)
    setActionFeedback({
      phase: "requesting",
      title: `${ACTION_PROGRESS_TITLES[action]}`,
      message: "Sending the request to Coolify…",
    })

    try {
      const result = await requestCoolifyResourceAction(selectedResource.id, action)
      if (!isCurrentOperation()) return

      setActionFeedback({
        phase: "updating",
        title: `${ACTION_TITLES[action]} queued`,
        message: `${result.message} Refreshing its status now…`,
      })

      const controller = new AbortController()
      refreshController.current = controller
      const refreshResult = await refreshCoolifyResourceAfterAction(
        selectedResource.id,
        action,
        controller.signal
      )
      if (!isCurrentOperation() || controller.signal.aborted) return

      setActionFeedback(
        refreshResult.settled
          ? {
              phase: "complete",
              title: `Resource ${ACTION_PAST_TENSE[action]}`,
              message: "The status shown here is now up to date with Coolify.",
            }
          : {
              phase: "accepted",
              title: `${ACTION_TITLES[action]} queued`,
              message: refreshResult.refreshed
                ? "The latest status is shown here. Monitoring will continue in the background."
                : "Coolify accepted the request. Monitoring will continue in the background.",
            }
      )
    } catch (error) {
      if (!isCurrentOperation()) return
      setActionFeedback({
        phase: "error",
        title: "Action could not be queued",
        message: coolifyResourceActionErrorMessage(error),
      })
    } finally {
      if (isCurrentOperation()) {
        actionInFlight.current = false
        refreshController.current = null
        setPendingAction(null)
      }
    }
  }

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
          headerRight:
            selectedResource && supportsCoolifyResourceActions(selectedResource)
              ? () => (
                  <ActionMenu
                    resource={selectedResource}
                    pendingAction={pendingAction}
                    onAction={(action) => void performResourceAction(action)}
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
                        attributes: { destructive: true },
                      },
                    ]}
                  />
                )
              : undefined,
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
              {actionFeedback && <ResourceActionStatus feedback={actionFeedback} />}
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

type ResourceMenuAction = MenuAction & { id: CoolifyResourceAction }

const ACTION_TITLES: Record<CoolifyResourceAction, string> = {
  start: "Start",
  restart: "Restart",
  stop: "Stop",
}

const ACTION_PROGRESS_TITLES: Record<CoolifyResourceAction, string> = {
  start: "Starting…",
  restart: "Restarting…",
  stop: "Stopping…",
}

const ACTION_PAST_TENSE: Record<CoolifyResourceAction, string> = {
  start: "started",
  restart: "restarted",
  stop: "stopped",
}

const ActionMenu = ({
  resource,
  actions,
  pendingAction,
  onAction,
}: {
  resource: Resource
  actions: ResourceMenuAction[]
  pendingAction: CoolifyResourceAction | null
  onAction: (action: CoolifyResourceAction) => void
}) => {
  return (
    <MenuView
      onPressAction={({ nativeEvent }) => {
        const action = nativeEvent.event
        if (action === "start" || action === "restart" || action === "stop") {
          onAction(action)
        }
      }}
      actions={actions.map((action) => ({
        ...action,
        title: pendingAction === action.id ? ACTION_PROGRESS_TITLES[action.id] : action.title,
        attributes: {
          ...action.attributes,
          disabled: pendingAction !== null || !canRequestCoolifyResourceAction(resource, action.id),
        },
      }))}>
      <Button variant="ghost" accessibilityLabel="Resource actions">
        <Icon as={Ellipsis} />
      </Button>
    </MenuView>
  )
}

const ResourceActionStatus = ({ feedback }: { feedback: ResourceActionFeedback }) => {
  const isWorking = feedback.phase === "requesting" || feedback.phase === "updating"
  const isError = feedback.phase === "error"

  return (
    <Card>
      <CardContent accessibilityLiveRegion="polite" className="flex-row items-center gap-3 py-3">
        <View
          className={`h-10 w-10 items-center justify-center rounded-full ${
            isError ? "bg-red-500/10" : isWorking ? "bg-blue-500/10" : "bg-emerald-500/10"
          }`}>
          {isWorking ? (
            <ActivityIndicator />
          ) : (
            <Icon
              as={isError ? CircleAlert : CircleCheck}
              size={20}
              className={
                isError ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
              }
            />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-semibold">{feedback.title}</Text>
          <Text className="text-sm text-muted-foreground">{feedback.message}</Text>
        </View>
      </CardContent>
    </Card>
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

  // running state
  const isRunning = resource.status === "running" || resource.status === "unknown"

  // button
  return (
    <View className="p-8">
      {supportsLiquidGlass ? (
        <GlassView
          glassEffectStyle="regular"
          isInteractive
          style={{ width: "100%", height: 48, borderRadius: 24, opacity: isRunning ? 1 : 0.5 }}>
          <Pressable
            disabled={!isRunning}
            accessibilityRole="button"
            className="flex h-full w-full flex-row items-center justify-center gap-2 active:opacity-70"
            onPress={openLogs}>
            <Icon as={Logs} />
            <Text className="text-sm font-semibold">Logs</Text>
          </Pressable>
        </GlassView>
      ) : (
        <NativeButton disabled={!isRunning} title="Logs" onPress={openLogs} />
      )}
    </View>
  )
}
