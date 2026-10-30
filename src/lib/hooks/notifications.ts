import Constants from "expo-constants"
import * as Device from "expo-device"
import * as Notifications from "expo-notifications"
import { Platform } from "react-native"
import {
  markNotificationDelivery,
  prepareNotificationStorageForBackground,
  saveNotification,
} from "@/lib/storage/notifications"
import { useSettingsStore } from "@/lib/stores/settings"

// Expo's push service endpoint used to deliver remote notifications.
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send"

// notification data
type NotificationData = {
  title: string
  body: string
  data?: Record<string, unknown>
  channelId?: NotificationChannelId
  trigger?: Notifications.TimeIntervalTriggerInput
}

const LOCAL_NOTIFICATION_ID_KEY = "__coolerNotificationId"

// Android notification channels mirror Coolify's notification event groups
const notificationChannels = {
  deployments: {
    name: "Deployments",
    description: "Deployment results and container status changes",
    importance: Notifications.AndroidImportance.HIGH,
  },
  backups: {
    name: "Backups",
    description: "Database backup results",
    importance: Notifications.AndroidImportance.DEFAULT,
  },
  "scheduled-tasks": {
    name: "Scheduled Tasks",
    description: "Scheduled task results",
    importance: Notifications.AndroidImportance.DEFAULT,
  },
  servers: {
    name: "Server Alerts",
    description: "Server availability, disk usage, cleanup, and update alerts",
    importance: Notifications.AndroidImportance.HIGH,
  },
} satisfies Record<string, Notifications.NotificationChannelInput>

type NotificationChannelId = keyof typeof notificationChannels

// calculate minutes since midnight
const minutesSinceMidnight = (date: Date) => date.getHours() * 60 + date.getMinutes()

/**
 * checks if quiet hours are currently active
 */
const areQuietHoursActive = async (now = new Date()) => {
  // notification handlers can run before the settings store finishes its
  // asynchronous hydration, so we need to wait for it so persisted quiet hours are honored
  if (!useSettingsStore.persist.hasHydrated()) {
    await useSettingsStore.persist.rehydrate()
  }

  const { quietFrom, quietTo } = useSettingsStore.getState().settings
  const current = minutesSinceMidnight(now)
  const from = minutesSinceMidnight(quietFrom)
  const to = minutesSinceMidnight(quietTo)

  // matching times mean no quiet-hours window is configured
  if (from === to) return false

  // same-day window, e.g. 13:00-17:00
  if (from < to) return current >= from && current < to

  // overnight window, e.g. 22:00-07:00
  return current >= from || current < to
}

// handler
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const dropNotification = await areQuietHoursActive()
    const { content, identifier, trigger } = notification.request
    const isWebhook = trigger !== null && "type" in trigger && trigger.type === "push"
    const storedLocalId = content.data?.[LOCAL_NOTIFICATION_ID_KEY]

    try {
      // persist before presentation so an unsaved
      // notification can never be shown to the user
      //
      // quiet-hours drops are retained in the archive too
      if (!isWebhook && typeof storedLocalId === "number" && Number.isSafeInteger(storedLocalId)) {
        // The local notification was archived before it was scheduled. Do not
        // make foreground presentation wait on another Keychain round-trip;
        // Expo discards notifications whose handler exceeds three seconds.
        void markNotificationDelivery(storedLocalId, dropNotification ? "dropped" : "received").catch(
          (error) => console.error("[notifications] delivery archive update failed:", error)
        )
      } else {
        await saveNotification({
          requestId: identifier,
          title: content.title ?? undefined,
          body: content.body ?? undefined,
          data: content.data,
          source: isWebhook ? "webhook" : "local",
          delivery: dropNotification ? "dropped" : "received",
        })
      }
    } catch {
      // secure persistence is mandatory
      //
      // if it fails, discard the incoming notification
      // instead of allowing an unarchived notification through
      return {
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      }
    }

    return {
      shouldPlaySound: !dropNotification,
      shouldSetBadge: false,
      shouldShowBanner: !dropNotification,
      shouldShowList: !dropNotification,
    }
  },
  handleError: (notificationId, error) => {
    console.error(`[notifications] foreground handler failed for ${notificationId}:`, error)
  },
})

// registers the Android notification channels Coolify's event groups map to
const registerNotificationChannels = async () => {
  if (Platform.OS !== "android") return

  await Promise.all(
    Object.entries(notificationChannels).map(([id, channel]) =>
      Notifications.setNotificationChannelAsync(id, channel)
    )
  )
}

/** Returns true when the user has granted (or already granted) alert permission. */
const ensureNotificationPermissions = async () => {
  const permissions = await Notifications.getPermissionsAsync()
  if (permissions.status === "granted" && (Platform.OS !== "ios" || permissions.ios?.allowsAlert !== false)) {
    return true
  }

  const requestedPermissions = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  })
  return (
    requestedPermissions.status === "granted" &&
    (Platform.OS !== "ios" || requestedPermissions.ios?.allowsAlert !== false)
  )
}

/**
 * requests permission to present notifications created by this app
 *
 * this only prepares local presentation (permission + Android channels); use
 * {@link registerForExpoPushNotifications} to additionally obtain an Expo push
 * token for remote delivery
 */
export const enableLocalNotifications = async () => {
  await prepareNotificationStorageForBackground()
  await registerNotificationChannels()
  return ensureNotificationPermissions()
}

/**
 * Resolves the EAS project id used to scope the Expo push token. Expo requires
 * this for `getExpoPushTokenAsync` outside of the legacy classic build service.
 */
const getExpoProjectId = () => {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  if (!projectId) {
    throw Error("Missing EAS project id; an Expo push token cannot be requested.")
  }
  return projectId
}

// Expo push tokens are stable per install, so we cache the value once obtained.
let cachedExpoPushToken: string | null = null

/**
 * Registers the device for remote notifications and returns its Expo push token
 * (`ExponentPushToken[...]`). Requires a physical device, notification
 * permission, and the iOS `aps-environment` entitlement.
 */
export const registerForExpoPushNotifications = async () => {
  await prepareNotificationStorageForBackground()
  await registerNotificationChannels()

  if (!Device.isDevice) {
    throw Error("Expo push tokens are only available on a physical device.")
  }

  const granted = await ensureNotificationPermissions()
  if (!granted) {
    throw Error("Notification alerts are disabled in system settings.")
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId: getExpoProjectId() })
  cachedExpoPushToken = token.data
  return token.data
}

/** Returns the cached Expo push token, registering for one if needed. */
export const getExpoPushToken = async () => cachedExpoPushToken ?? (await registerForExpoPushNotifications())

type ExpoPushContent = {
  title: string
  body: string
  data?: Record<string, unknown>
  channelId?: NotificationChannelId
}

/**
 * Sends a notification to this device through Expo's push service, exercising
 * the full remote delivery path (device token → Expo → APNs/FCM → device).
 */
export const sendExpoPushToSelf = async (content: ExpoPushContent) => {
  const token = await getExpoPushToken()
  const channelId = content.channelId ?? "deployments"

  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      title: content.title,
      body: content.body,
      sound: "default",
      priority: "high",
      channelId,
      data: { ...content.data },
    }),
  })

  if (!response.ok) {
    throw Error(`Expo push request failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as {
    data?: ExpoPushTicket | ExpoPushTicket[]
    errors?: { message: string }[]
  }

  if (payload.errors?.length) {
    throw Error(payload.errors.map((error) => error.message).join("; "))
  }

  // a single-message request returns one ticket; an array request returns many
  const ticket = Array.isArray(payload.data) ? payload.data[0] : payload.data
  if (ticket?.status === "error") {
    throw Error(ticket.message ?? "Expo rejected the push notification.")
  }
}

type ExpoPushTicket = {
  status: "ok" | "error"
  message?: string
  details?: { error?: string }
}

/**
 * Sends an Expo push to this device, optionally deferred until `fireDate`.
 *
 * The token/permission handshake happens up front so failures surface
 * immediately rather than inside the timer. A deferred send relies on an
 * in-process timer, so the app must stay running until it fires. it is meant
 * for short debug delays, not durable scheduling.
 */
export const scheduleExpoPushToSelf = async (content: ExpoPushContent, fireDate?: Date | null) => {
  // surface token/permission errors before scheduling anything
  await getExpoPushToken()

  const delayMs = fireDate ? fireDate.getTime() - Date.now() : 0
  if (delayMs <= 0) {
    await sendExpoPushToSelf(content)
    return { scheduledFor: null as Date | null }
  }

  setTimeout(() => {
    void sendExpoPushToSelf(content).catch((error) =>
      console.error("[notifications] deferred Expo push failed:", error)
    )
  }, delayMs)

  return { scheduledFor: fireDate ?? null }
}

/** Creates and archives a notification generated by local polling. */
export const createLocalNotification = async (data: NotificationData) => {
  const permissions = await Notifications.getPermissionsAsync()
  if (permissions.status !== "granted" || (Platform.OS === "ios" && permissions.ios?.allowsAlert === false)) {
    throw Error("Notification alerts are disabled in system settings.")
  }

  const { trigger } = data
  const channelId = data.channelId ?? "deployments"
  const dropNotification = await areQuietHoursActive()

  // Save before scheduling, including notifications dropped because of quiet hours.
  const storedNotificationId = await saveNotification({
    title: data.title,
    body: data.body,
    data: data.data,
    channelId,
    source: "local",
    delivery: dropNotification ? "dropped" : "generated",
  })

  if (dropNotification) return

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: data.title,
        body: data.body,
        sound: "default",
        data: {
          ...data.data,
          [LOCAL_NOTIFICATION_ID_KEY]: storedNotificationId,
        },
      },
      // These notifications describe events that have already happened. iOS
      // should receive the explicit immediate trigger instead of a synthetic
      // time-interval trigger; Android still needs the channel on its trigger.
      trigger: trigger
        ? { ...trigger, channelId: trigger.channelId ?? channelId }
        : Platform.OS === "ios"
          ? null
          : { channelId },
    })
  } catch (error) {
    await markNotificationDelivery(storedNotificationId, "failed")
    throw error
  }
}

export const useNotifications = () => {
  return {
    enableLocalNotifications,
    createLocalNotification,
    registerForExpoPushNotifications,
    getExpoPushToken,
    sendExpoPushToSelf,
    scheduleExpoPushToSelf,
  }
}
