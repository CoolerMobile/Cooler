import { channelForEvent, presentBridgeEvent } from "@/lib/cooler-cloud/push"
import {
  DEMO_CONNECTIONS,
  DEMO_COOLIFY_VERSION,
  DEMO_SIGN_IN_CODE,
  DEMO_TOKEN_PREFIX,
  isDemoToken,
} from "@/lib/demo/fixtures"
import { getDemoEngine, isDemoServer, resetDemoEngine } from "@/lib/demo/runtime"
import { completeSignInWithCode } from "@/lib/hooks/account/session"
import { refreshCoolifyData } from "@/lib/hooks/data/coolify"
import { refreshDeployments } from "@/lib/hooks/data/deployments"
import { createLocalNotification, enableLocalNotifications } from "@/lib/hooks/notifications"
import type { ServerData } from "@/lib/hooks/servers/connection"
import { deleteNotificationsForServer } from "@/lib/storage/notifications"
import { useAccountStore } from "@/lib/stores/account"
import { useDataStore } from "@/lib/stores/data"
import { useDemoStore, useIsDemo } from "@/lib/stores/demo"
import { useDeploymentStore } from "@/lib/stores/deployments"
import { useSettingsStore } from "@/lib/stores/settings"
import { useEffect, useState } from "react"
import { Alert, AppState } from "react-native"

// how often simulated bridge events are checked for
const DEMO_TICK_MS = 2_000

// events older than this are archived by the next sync instead of pushed
const STALE_EVENT_MS = 5 * 60_000

/** the saved connections the demo adds */
const demoConnections = (): ServerData[] =>
  DEMO_CONNECTIONS.map((connection) => ({
    id: connection.id,
    nickname: connection.nickname,
    endpoint: connection.endpoint,
    token: `${DEMO_TOKEN_PREFIX}coolify_${connection.id}`,
    version: DEMO_COOLIFY_VERSION,
    health: "ok",
  }))

/**
 * start demo mode with sample servers and a signed in demo account
 *
 * only runs on a clean install, so real servers and a real coolercloud account
 * are never mixed with sample data
 */
export const enterDemo = async () => {
  const data = useDataStore.getState()
  const account = useAccountStore.getState()
  if (!data.hasHydrated || !account.hasHydrated || !useDemoStore.getState().hasHydrated) {
    throw Error("Cooler is still loading. Try again in a moment.")
  }
  if (data.servers.some((server) => !isDemoServer(server))) {
    throw Error("The demo runs without your own servers. Remove them first to try it.")
  }
  if (account.session && !isDemoToken(account.session.token)) {
    throw Error("Sign out of CoolerCloud first. The demo uses its own sample account.")
  }

  resetDemoEngine()
  useDemoStore.getState().setEnabled(true)
  useDataStore.getState().setServers(demoConnections())

  // signs into the demo account through the regular flow, which the demo answers
  await completeSignInWithCode(DEMO_SIGN_IN_CODE).catch((error) =>
    console.error("[demo] sample account sign in failed:", error)
  )

  // simulated pushes are shown as local notifications
  await enableLocalNotifications().catch((error) => console.error("[demo] notifications unavailable:", error))

  void refreshCoolifyData()
  void refreshDeployments()
}

/** leave demo mode and remove every piece of sample data from this device */
export const exitDemo = async () => {
  const servers = useDataStore.getState().servers.filter(isDemoServer)

  const { session } = useAccountStore.getState()
  if (!session || isDemoToken(session.token)) useAccountStore.getState().reset()

  for (const server of servers) {
    await deleteNotificationsForServer(server.id).catch((error) =>
      console.error("[demo] notification cleanup failed:", error)
    )
    useDeploymentStore.getState().removeServerData(server.id, server.nickname)
    useDataStore.getState().removeServerData(server.id)
  }

  // the flag goes last so requests still in flight keep hitting the demo
  useDemoStore.getState().setEnabled(false)
  resetDemoEngine()
}

/**
 * present simulated bridge events as push notifications
 *
 * mirrors what a paired bridge does: only a signed in account with the bridge
 * paired gets them, and muted deployment alerts are respected
 */
const deliverDemoEvents = async () => {
  const { events, changed } = getDemoEngine().drain()

  // statuses moved on, so screens pick it up without waiting for the next poll
  if (changed) {
    void refreshCoolifyData()
    void refreshDeployments()
  }

  const { session, bridges } = useAccountStore.getState()
  if (!session || !isDemoToken(session.token)) return

  const { deploymentAlerts } = useSettingsStore.getState().settings
  for (const event of events) {
    if (!bridges.some((link) => link.cloudBridgeId === event.bridgeId)) continue
    if (Date.now() - Date.parse(event.createdAt) > STALE_EVENT_MS) continue
    if (!deploymentAlerts && channelForEvent(event.type) === "deployments") continue

    await createLocalNotification({ requestId: event.id, ...presentBridgeEvent(event) }).catch((error) =>
      console.error("[demo] notification delivery failed:", error)
    )
  }
}

/** move the demo forward and deliver its notifications while demo mode is on */
export const useDemoMonitor = () => {
  const isDemo = useIsDemo()

  useEffect(() => {
    if (!isDemo) return

    const interval = setInterval(() => {
      if (AppState.currentState !== "active") return
      void deliverDemoEvents().catch((error) => console.error("[demo] tick failed:", error))
    }, DEMO_TICK_MS)

    return () => clearInterval(interval)
  }, [isDemo])
}

/** demo mode state and actions for screens */
export const useDemoMode = () => {
  const isDemo = useIsDemo()
  const [busy, setBusy] = useState(false)

  const startDemo = async () => {
    if (busy) return

    try {
      setBusy(true)
      await enterDemo()
    } catch (error) {
      Alert.alert(
        "Demo unavailable",
        error instanceof Error ? error.message : "The demo could not be started."
      )
    } finally {
      setBusy(false)
    }
  }

  const runExit = async () => {
    try {
      setBusy(true)
      await exitDemo()
    } catch (error) {
      Alert.alert("Could not exit demo", error instanceof Error ? error.message : "Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const confirmExitDemo = () => {
    Alert.alert(
      "Exit demo?",
      "Sample servers, deployments and notifications will be removed from this device.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Exit demo", style: "destructive", onPress: () => void runExit() },
      ]
    )
  }

  return { isDemo, busy, startDemo, confirmExitDemo }
}
