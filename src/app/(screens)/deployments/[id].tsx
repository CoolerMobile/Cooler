import { ActiveIndicator, DeploymentStatusIcon, StatusBadge } from "@/components/custom/deployments/status"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { deploymentDuration, shortCommit } from "@/lib/deployments/presentation"
import {
  cancelDeployment,
  deploymentErrorMessage,
  redeployDeployment,
  rollbackDeployment,
} from "@/lib/hooks/data/deployments"
import { useNotifications } from "@/lib/hooks/notifications"
import { useScreenOptions } from "@/lib/hooks/screen-options"
import { useDeploymentStore } from "@/lib/stores/deployments"
import type { Deployment } from "@/lib/types/deployment"
import MenuView from "@expo/ui/community/menu"
import dayjs from "dayjs"
import { Stack, useLocalSearchParams } from "expo-router"
import { Ellipsis, GitBranch, Server, TerminalSquare } from "lucide-react-native"
import { useEffect, useRef, useState } from "react"
import { Alert, ScrollView, View } from "react-native"

type DeploymentAction = "cancel" | "redeploy" | "rollback"

export default function DeploymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const deployment = useDeploymentStore((state) => state.deployments.find((item) => item.id === id))
  const watchedDeploymentIds = useDeploymentStore((state) => state.watchedDeploymentIds)
  const watchDeployment = useDeploymentStore((state) => state.watchDeployment)
  const unwatchDeployment = useDeploymentStore((state) => state.unwatchDeployment)
  const { registerDevice } = useNotifications()
  const { options } = useScreenOptions()
  const [pendingAction, setPendingAction] = useState<DeploymentAction | null>(null)
  const [notificationBusy, setNotificationBusy] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)

  const watched = deployment ? watchedDeploymentIds.includes(deployment.id) : false
  const active = deployment ? ["queued", "running"].includes(deployment.status) : false

  const toggleNotification = async () => {
    if (!deployment || notificationBusy) return
    if (watched) {
      unwatchDeployment(deployment.id)
      return
    }

    setNotificationBusy(true)
    try {
      const token = await registerDevice()
      if (!token) {
        Alert.alert(
          "Notifications are off",
          "Allow notifications in system settings to be notified when this deployment finishes."
        )
        return
      }
      watchDeployment(deployment.id)
    } catch (error) {
      Alert.alert(
        "Notifications unavailable",
        error instanceof Error ? error.message : "Please try again on a physical device."
      )
    } finally {
      setNotificationBusy(false)
    }
  }

  const runAction = async (action: DeploymentAction) => {
    if (!deployment || pendingAction) return
    setPendingAction(action)
    try {
      if (action === "cancel") await cancelDeployment(deployment)
      else if (action === "redeploy") await redeployDeployment(deployment)
      else await rollbackDeployment(deployment)

      Alert.alert(
        action === "cancel"
          ? "Deployment cancelled"
          : action === "redeploy"
            ? "Redeploy queued"
            : "Rollback queued",
        action === "cancel"
          ? "Coolify accepted the cancellation request."
          : "Coolify accepted the deployment request. It will appear at the top of Deployments shortly."
      )
    } catch (error) {
      Alert.alert(`${action[0].toUpperCase()}${action.slice(1)} failed`, deploymentErrorMessage(error))
    } finally {
      setPendingAction(null)
    }
  }

  const confirmAction = (action: DeploymentAction) => {
    if (!deployment) return
    if (action === "cancel") {
      Alert.alert(
        "Cancel deployment?",
        `${deployment.resourceName} will remain on its currently deployed version.`,
        [
          { text: "Keep running", style: "cancel" },
          { text: "Cancel deployment", style: "destructive", onPress: () => void runAction("cancel") },
        ]
      )
      return
    }
    if (action === "redeploy") {
      Alert.alert(
        "Redeploy application?",
        `This will queue a new deployment for ${deployment.resourceName}.`,
        [
          { text: "Not now", style: "cancel" },
          { text: "Redeploy", onPress: () => void runAction("redeploy") },
        ]
      )
      return
    }
    Alert.alert(
      "Rollback application?",
      `This changes ${deployment.resourceName} to commit ${shortCommit(deployment.commit)} and immediately starts a forced deployment. This can affect production traffic.`,
      [
        { text: "Not now", style: "cancel" },
        { text: "Rollback and deploy", style: "destructive", onPress: () => void runAction("rollback") },
      ]
    )
  }

  return (
    <>
      <Stack.Screen
        options={options({
          title: deployment?.resourceName ?? "Deployment",
          headerBackButtonDisplayMode: "minimal",
          headerRight: deployment
            ? () => (
                <DeploymentActionsMenu
                  active={active}
                  canRollback={Boolean(deployment.resourceUuid && deployment.commit)}
                  canRedeploy={Boolean(deployment.resourceUuid)}
                  notificationBusy={notificationBusy}
                  pendingAction={pendingAction}
                  watched={watched}
                  onLogs={() => setLogsOpen(true)}
                  onNotification={() => void toggleNotification()}
                  onAction={confirmAction}
                />
              )
            : undefined,
        })}
      />

      {!deployment ? (
        <View className="flex-1 items-center justify-center gap-2 p-6">
          <Text className="text-lg font-semibold">Deployment not found</Text>
          <Text className="text-center text-muted-foreground">
            Refresh the Deployments screen and try again.
          </Text>
        </View>
      ) : (
        <View className="flex-1 gap-5 bg-background p-4">
          <DeploymentHeader deployment={deployment} />
          <DeploymentMetadata deployment={deployment} />
        </View>
      )}

      {deployment ? (
        <DeploymentLogsSheet deployment={deployment} open={logsOpen} onClose={() => setLogsOpen(false)} />
      ) : null}
    </>
  )
}

function DeploymentActionsMenu({
  active,
  canRollback,
  canRedeploy,
  notificationBusy,
  pendingAction,
  watched,
  onLogs,
  onNotification,
  onAction,
}: {
  active: boolean
  canRollback: boolean
  canRedeploy: boolean
  notificationBusy: boolean
  pendingAction: DeploymentAction | null
  watched: boolean
  onLogs: () => void
  onNotification: () => void
  onAction: (action: DeploymentAction) => void
}) {
  const actions = [
    { id: "logs", title: active ? "View live logs" : "View build logs" },
    ...(active
      ? [
          {
            id: "notification",
            title: notificationBusy
              ? "Setting notification…"
              : watched
                ? "Turn off notification"
                : "Notify me when finished",
            attributes: { disabled: notificationBusy },
          },
          {
            id: "cancel",
            title: pendingAction === "cancel" ? "Cancelling…" : "Cancel deployment",
            attributes: { destructive: true, disabled: pendingAction !== null },
          },
        ]
      : [
          {
            id: "redeploy",
            title: pendingAction === "redeploy" ? "Redeploying…" : "Redeploy",
            attributes: { disabled: pendingAction !== null || !canRedeploy },
          },
          {
            id: "rollback",
            title: pendingAction === "rollback" ? "Rolling back…" : "Rollback to this commit",
            attributes: { destructive: true, disabled: pendingAction !== null || !canRollback },
          },
        ]),
  ]

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        if (nativeEvent.event === "logs") onLogs()
        else if (nativeEvent.event === "notification") onNotification()
        else if (["cancel", "redeploy", "rollback"].includes(nativeEvent.event)) {
          onAction(nativeEvent.event as DeploymentAction)
        }
      }}>
      <Button variant="ghost" size="icon" accessibilityLabel="Deployment actions">
        <Icon as={Ellipsis} />
      </Button>
    </MenuView>
  )
}

function DeploymentHeader({ deployment }: { deployment: Deployment }) {
  return (
    <Card className={`gap-4 p-5 ${deployment.status === "failed" ? "border-red-500/50 bg-red-500/5" : ""}`}>
      <View className="flex-row items-start gap-3">
        <View
          className={`h-11 w-11 items-center justify-center rounded-full ${deployment.status === "failed" ? "bg-red-500/10" : "bg-muted"}`}>
          <DeploymentStatusIcon status={deployment.status} size={23} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text numberOfLines={1} className="text-xl font-bold">
            {deployment.resourceName}
          </Text>
          <Text numberOfLines={1} className="text-sm text-muted-foreground">
            {[deployment.projectName, deployment.environmentName].filter(Boolean).join(" · ") ||
              "Application deployment"}
          </Text>
        </View>
        <StatusBadge status={deployment.status} />
      </View>
      <View className="flex-row border-t border-border pt-4">
        <HeaderFact icon={Server} label="Server" value={deployment.serverName} />
        <View className="w-hairline mx-3 bg-border" />
        <HeaderFact icon={GitBranch} label="Commit" value={shortCommit(deployment.commit)} mono />
        <View className="w-hairline mx-3 bg-border" />
        <HeaderFact label="Duration" value={deploymentDuration(deployment)} />
      </View>
    </Card>
  )
}

function HeaderFact({
  icon,
  label,
  value,
  mono = false,
}: {
  icon?: typeof Server
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <View className="flex-row items-center gap-1.5">
        {icon ? <Icon as={icon} size={13} className="text-muted-foreground" /> : null}
        <Text className="text-xs text-muted-foreground">{label}</Text>
      </View>
      <Text numberOfLines={1} className={`text-sm font-semibold ${mono ? "font-mono" : ""}`}>
        {value}
      </Text>
    </View>
  )
}

function DeploymentMetadata({ deployment }: { deployment: Deployment }) {
  const rows = [
    ["Commit", deployment.commit ?? "Not reported"],
    ["Message", deployment.commitMessage ?? "Not reported"],
    ["Trigger", deployment.trigger],
    ["Started", dayjs(deployment.createdAt).format("MMM D, YYYY · HH:mm:ss")],
    ["Deployment ID", deployment.uuid],
  ]

  return (
    <View className="gap-3">
      <Text className="px-1 text-xl font-bold">Details</Text>
      <Card className="gap-0 overflow-hidden py-0">
        {rows.map(([label, value], index) => (
          <View
            key={label}
            className={`flex-row items-start gap-4 px-4 py-3 ${index ? "border-t border-border" : ""}`}>
            <Text className="w-24 text-sm text-muted-foreground">{label}</Text>
            <Text
              selectable
              numberOfLines={label === "Message" ? 2 : 1}
              className={`min-w-0 flex-1 text-right text-sm font-medium ${label === "Commit" || label === "Deployment ID" ? "font-mono" : ""}`}>
              {value}
            </Text>
          </View>
        ))}
      </Card>
    </View>
  )
}

function DeploymentLogsSheet({
  deployment,
  open,
  onClose,
}: {
  deployment: Deployment
  open: boolean
  onClose: () => void
}) {
  const logScrollRef = useRef<ScrollView>(null)
  const active = ["queued", "running"].includes(deployment.status)
  const logLines = deployment.logs ? deployment.logs.split(/\r\n|\r|\n/) : []
  const lineCount = logLines.length

  useEffect(() => {
    if (open && active) {
      const frame = requestAnimationFrame(() => logScrollRef.current?.scrollToEnd({ animated: false }))
      return () => cancelAnimationFrame(frame)
    }
  }, [active, deployment.logs, open])

  return (
    <BottomSheet
      key={`deployment-logs-${deployment.id}`}
      index={open ? 0 : -1}
      onDismiss={onClose}
      enablePanDownToClose
      snapPoints={["85%"]}>
      <View className="flex-1 gap-3 px-4 pb-5 pt-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Icon as={TerminalSquare} size={19} />
            </View>
            <View>
              <Text className="text-lg font-bold">{active ? "Live logs" : "Build logs"}</Text>
              <View className="flex-row items-center gap-2">
                {active ? <ActiveIndicator size={12} /> : null}
                <Text className="text-xs text-muted-foreground">
                  {active
                    ? "Streaming from Coolify"
                    : `Saved ${dayjs(deployment.updatedAt).format("MMM D, HH:mm")}`}
                </Text>
              </View>
            </View>
          </View>
          <Button variant="ghost" size="sm" accessibilityLabel="Close logs" onPress={onClose}>
            <Text>Done</Text>
          </Button>
        </View>

        <View className="flex-row items-center justify-between">
          <Text numberOfLines={1} className="flex-1 text-xs text-muted-foreground">
            {deployment.resourceName}
          </Text>
          <Text className="text-xs tabular-nums text-muted-foreground">
            {lineCount} {lineCount === 1 ? "line" : "lines"}
          </Text>
        </View>

        {deployment.logs ? (
          <ScrollView
            ref={logScrollRef}
            className="flex-1 rounded-xl border border-border bg-card"
            contentContainerClassName="py-3"
            showsVerticalScrollIndicator>
            {logLines.map((line, index) => (
              <View key={`${index}-${line.slice(0, 16)}`} className="flex-row px-3 py-0.5">
                <Text className="w-10 shrink-0 pr-3 text-right font-mono text-xs leading-5 text-muted-foreground">
                  {index + 1}
                </Text>
                <Text selectable className="min-w-0 flex-1 font-mono text-xs leading-5 text-foreground">
                  {line || " "}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View className="flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card p-6">
            <Icon as={TerminalSquare} size={26} className="text-muted-foreground" />
            <Text className="text-center text-sm text-muted-foreground">
              {active ? "Waiting for Coolify to publish logs…" : "No deployment logs were retained."}
            </Text>
          </View>
        )}
      </View>
    </BottomSheet>
  )
}
