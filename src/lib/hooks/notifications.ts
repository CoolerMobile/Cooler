import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  markNotificationDelivery,
  prepareNotificationStorageForBackground,
  saveNotification,
} from "@/lib/storage/notifications";
import { useSettingsStore } from "@/lib/stores/settings";

// notification data
type NotificationData = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: NotificationChannelId;
  trigger?: Notifications.TimeIntervalTriggerInput;
};

const LOCAL_NOTIFICATION_ID_KEY = "__coolerNotificationId";

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
} satisfies Record<string, Notifications.NotificationChannelInput>;

type NotificationChannelId = keyof typeof notificationChannels;

// calculate minutes since midnight
const minutesSinceMidnight = (date: Date) => date.getHours() * 60 + date.getMinutes();

/**
 * checks if quiet hours are currently active
 */
const areQuietHoursActive = async (now = new Date()) => {
  // notification handlers can run before the settings store finishes its
  // asynchronous hydration, so we need to wait for it so persisted quiet hours are honored
  if (!useSettingsStore.persist.hasHydrated()) {
    await useSettingsStore.persist.rehydrate();
  }

  const { quietFrom, quietTo } = useSettingsStore.getState().settings;
  const current = minutesSinceMidnight(now);
  const from = minutesSinceMidnight(quietFrom);
  const to = minutesSinceMidnight(quietTo);

  // matching times mean no quiet-hours window is configured
  if (from === to) return false;

  // same-day window, e.g. 13:00-17:00
  if (from < to) return current >= from && current < to;

  // overnight window, e.g. 22:00-07:00
  return current >= from || current < to;
};

// handler
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const dropNotification = await areQuietHoursActive();
    const { content, identifier, trigger } = notification.request;
    const isWebhook = trigger !== null && "type" in trigger && trigger.type === "push";
    const storedLocalId = content.data?.[LOCAL_NOTIFICATION_ID_KEY];

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
        );
      } else {
        await saveNotification({
          requestId: identifier,
          title: content.title ?? undefined,
          body: content.body ?? undefined,
          data: content.data,
          source: isWebhook ? "webhook" : "local",
          delivery: dropNotification ? "dropped" : "received",
        });
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
      };
    }

    return {
      shouldPlaySound: !dropNotification,
      shouldSetBadge: false,
      shouldShowBanner: !dropNotification,
      shouldShowList: !dropNotification,
    };
  },
  handleError: (notificationId, error) => {
    console.error(`[notifications] foreground handler failed for ${notificationId}:`, error);
  },
});

// notifications hook
/**
 * Requests permission to present notifications created by this app.
 * This intentionally does not register for remote notifications or request
 * an Expo push token, so iOS does not require the APS entitlement.
 */
export const enableLocalNotifications = async () => {
  await prepareNotificationStorageForBackground();

  if (Platform.OS === "android") {
    await Promise.all(
      Object.entries(notificationChannels).map(([id, channel]) =>
        Notifications.setNotificationChannelAsync(id, channel)
      )
    );
  }

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status === "granted" && (Platform.OS !== "ios" || permissions.ios?.allowsAlert !== false)) {
    return true;
  }

  const requestedPermissions = await Notifications.requestPermissionsAsync();
  return (
    requestedPermissions.status === "granted" &&
    (Platform.OS !== "ios" || requestedPermissions.ios?.allowsAlert !== false)
  );
};

/** Creates and archives a notification generated by local polling. */
export const createLocalNotification = async (data: NotificationData) => {
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== "granted" || (Platform.OS === "ios" && permissions.ios?.allowsAlert === false)) {
    throw Error("Notification alerts are disabled in system settings.");
  }

  const { trigger } = data;
  const channelId = data.channelId ?? "deployments";
  const dropNotification = await areQuietHoursActive();

  // Save before scheduling, including notifications dropped because of quiet hours.
  const storedNotificationId = await saveNotification({
    title: data.title,
    body: data.body,
    data: data.data,
    channelId,
    source: "local",
    delivery: dropNotification ? "dropped" : "generated",
  });

  if (dropNotification) return;

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
      trigger: trigger
        ? { ...trigger, channelId: trigger.channelId ?? channelId }
        : {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            channelId,
            seconds: 2,
          },
    });
  } catch (error) {
    await markNotificationDelivery(storedNotificationId, "failed");
    throw error;
  }
};

export const useNotifications = () => {
  return { enableLocalNotifications, createLocalNotification };
};
