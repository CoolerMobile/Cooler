import type { BridgeEvent } from "@/lib/cooler-cloud/bridge"
import type { NotificationChannelId } from "@/lib/hooks/notifications"

/** push type a bridge sends once it stores a new event */
export const BRIDGE_EVENT_PUSH = "event.available"

/** identifiers a bridge event push carries, never the event content */
export type BridgeEventPush = {
  eventId: string
  bridgeId: string
}

/** shown when the event behind a push cannot be fetched */
export const FALLBACK_EVENT_CONTENT = {
  title: "New Coolify event",
  body: "Open Cooler to see the details.",
}

/**
 * read a bridge event push from notification data
 *
 * @param data notification data
 *
 * @returns the push identifiers or null when the data is not a bridge event push
 */
export const readBridgeEventPush = (data: unknown): BridgeEventPush | null => {
  if (!data || typeof data !== "object") return null

  const { type, eventId, bridgeId } = data as Record<string, unknown>
  if (type !== BRIDGE_EVENT_PUSH || typeof eventId !== "string" || typeof bridgeId !== "string") return null

  return { eventId, bridgeId }
}

/**
 * read a bridge event push from a background notification task payload
 *
 * both platforms carry the push data as a json string in `dataString`
 *
 * @param payload task payload data
 *
 * @returns the push identifiers or null when the payload is not a bridge event push
 */
export const readTaskPayload = (payload: {
  dataString?: unknown
  body?: unknown
}): BridgeEventPush | null => {
  if (typeof payload.dataString !== "string") return readBridgeEventPush(payload.body)

  try {
    return readBridgeEventPush(JSON.parse(payload.dataString))
  } catch {
    return null
  }
}

/**
 * pick the android channel matching an event type
 *
 * @param type normalized bridge event type
 *
 * @returns the notification channel id
 */
export const channelForEvent = (type: string): NotificationChannelId => {
  const event = type.replace(/^coolify\./, "")

  if (event.includes("backup")) return "backups"
  if (event.startsWith("task_")) return "scheduled-tasks"
  if (
    event.startsWith("deployment") ||
    ["status_changed", "restart_limit_reached", "container_restarted"].includes(event)
  ) {
    return "deployments"
  }

  return "servers"
}

/**
 * build the notification content for a fetched bridge event
 *
 * the resource name leads the body unless the message already names it
 *
 * @param event fetched bridge event
 *
 * @returns title, body, data and channel for a local notification
 */
export const presentBridgeEvent = (
  event: BridgeEvent
): { title: string; body: string; data: Record<string, unknown>; channelId: NotificationChannelId } => {
  const named = event.resourceName && !event.message.includes(event.resourceName)

  return {
    title: event.title,
    body: named ? `${event.resourceName}: ${event.message}` : event.message,
    data: { ...event.metadata, eventId: event.id, bridgeId: event.bridgeId },
    channelId: channelForEvent(event.type),
  }
}
