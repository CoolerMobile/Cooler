import * as bridge from "@/lib/cooler-cloud/bridge"
import {
  FALLBACK_EVENT_CONTENT,
  presentBridgeEvent,
  readTaskPayload,
  type BridgeEventPush,
} from "@/lib/cooler-cloud/push"
import { createLocalNotification } from "@/lib/hooks/notifications"
import { captureBackgroundException } from "@/lib/hooks/sentry"
import { getPushCredential } from "@/lib/storage/push-credentials"
import * as Notifications from "expo-notifications"
import * as TaskManager from "expo-task-manager"
import { Platform } from "react-native"

const BRIDGE_EVENT_TASK = "cooler-bridge-event"

/**
 * fetch the event behind a push and present it
 *
 * @param push identifiers carried by the push
 */
const presentPushedEvent = async (push: BridgeEventPush) => {
  // the event token outlives bridge sessions, so no cloud round trip is needed
  const credential = await getPushCredential(push.bridgeId)
  if (!credential) throw Error("No push credential for the pushed bridge")

  const event = await bridge.getPushedEvent(credential.baseUrl, credential.eventToken, push.eventId)
  await createLocalNotification({ requestId: event.id, ...presentBridgeEvent(event) })
}

// android pushes only carry ids, the content is fetched from the bridge and
// shown locally, ios pushes are rewritten by the notification service extension
TaskManager.defineTask<Notifications.NotificationTaskPayload>(BRIDGE_EVENT_TASK, async ({ data }) => {
  if (Platform.OS === "ios") return Notifications.BackgroundNotificationTaskResult.NoData

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
