import * as bridge from "@/lib/cooler-cloud/bridge"
import {
  FALLBACK_EVENT_CONTENT,
  presentBridgeEvent,
  readTaskPayload,
  type BridgeEventPush,
} from "@/lib/cooler-cloud/push"
import { ensureBridgeSession } from "@/lib/hooks/account/session"
import { createLocalNotification } from "@/lib/hooks/notifications"
import { captureBackgroundException } from "@/lib/hooks/sentry"
import { useAccountStore } from "@/lib/stores/account"
import * as Notifications from "expo-notifications"
import * as TaskManager from "expo-task-manager"

const BRIDGE_EVENT_TASK = "cooler-bridge-event"

/**
 * fetch the event behind a push and present it
 *
 * @param push identifiers carried by the push
 */
const presentPushedEvent = async (push: BridgeEventPush) => {
  // headless launches do not mount react, so restore the account first
  if (!useAccountStore.persist.hasHydrated()) await useAccountStore.persist.rehydrate()

  const link = useAccountStore.getState().bridges.find((entry) => entry.cloudBridgeId === push.bridgeId)
  if (!link) throw Error("Push received for an unknown bridge")

  const session = await ensureBridgeSession(link)
  const event = await bridge.getEvent(link.baseUrl, session.accessToken, push.eventId)

  await createLocalNotification({ requestId: event.id, ...presentBridgeEvent(event) })
}

// pushes only carry ids, the content is fetched from the bridge and shown locally
TaskManager.defineTask<Notifications.NotificationTaskPayload>(BRIDGE_EVENT_TASK, async ({ data }) => {
  // taps on a notification are not new events
  const push = data && !("actionIdentifier" in data) ? readTaskPayload(data.data) : null
  if (!push) return Notifications.BackgroundNotificationTaskResult.NoData

  try {
    await presentPushedEvent(push)
    return Notifications.BackgroundNotificationTaskResult.NewData
  } catch (error) {
    await captureBackgroundException(BRIDGE_EVENT_TASK, error)
    console.error("[notifications] bridge event fetch failed:", error)

    // nothing is silently lost, the archive fills in on the next sync
    await createLocalNotification(FALLBACK_EVENT_CONTENT).catch((fallbackError) =>
      console.error("[notifications] fallback notification failed:", fallbackError)
    )
    return Notifications.BackgroundNotificationTaskResult.Failed
  }
})

void Notifications.registerTaskAsync(BRIDGE_EVENT_TASK).catch((error) =>
  console.error("[notifications] bridge event task registration failed:", error)
)
