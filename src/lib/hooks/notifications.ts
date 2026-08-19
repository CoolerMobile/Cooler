import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  markNotificationDelivery,
  saveNotification,
} from "@/lib/storage/notifications";
import { useSettingsStore } from "@/lib/stores/settings";
import { parseError } from "@/lib/utils";
import { useSecureStorage } from "@/lib/hooks/secure";
import { useEffect, useRef, useState } from "react";

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
const minutesSinceMidnight = (date: Date) =>
  date.getHours() * 60 + date.getMinutes();

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
    const isWebhook =
      trigger !== null && "type" in trigger && trigger.type === "push";
    const storedLocalId = content.data?.[LOCAL_NOTIFICATION_ID_KEY];

    try {
      // persist before presentation so an unsaved
      // notification can never be shown to the user
      //
      // quiet-hours drops are retained in the archive too
      if (
        !isWebhook &&
        typeof storedLocalId === "number" &&
        Number.isSafeInteger(storedLocalId)
      ) {
        await markNotificationDelivery(
          storedLocalId,
          dropNotification ? "dropped" : "received",
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
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: !dropNotification,
      shouldShowList: !dropNotification,
    };
  },
});

// notifications hook
export const useNotifications = () => {
  // secure storage
  const { get, set } = useSecureStorage();

  // registration state
  const registration = useRef<Promise<string | null> | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);

  // register listeners once registration succeeds
  useEffect(() => {
    if (!isRegistered) return;

    const notifListener = Notifications.addNotificationReceivedListener(
      (notification) => notification,
    );
    const responseListener =
      Notifications.addNotificationResponseReceivedListener(
        (response) => response,
      );

    return () => {
      notifListener.remove();
      responseListener.remove();
    };
  }, [isRegistered]);

  /**
   * registers the device for push notifications,
   * sets up the notification listener and sets
   * the expo push token app-wide
   */
  const registerDevice = async () => {
    // reuse an in-flight or completed registration
    if (registration.current) return registration.current;

    registration.current = (async () => {
      // validate real device
      if (!Device.isDevice) {
        throw Error("push notifications require a real device");
      }

      // register channels before reusing a token so existing installs receive
      // newly added channels after an app update
      if (Platform.OS === "android") {
        await Promise.all(
          Object.entries(notificationChannels).map(([id, channel]) =>
            Notifications.setNotificationChannelAsync(id, channel),
          ),
        );
      }

      // reuse an established Expo token
      const storedToken = await get("expoToken");
      if (
        typeof storedToken === "string" &&
        /^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(storedToken)
      ) {
        setIsRegistered(true);
        return storedToken;
      }

      // permissions status
      const permissions = await Notifications.getPermissionsAsync();
      let permStatus = permissions.status;

      // validate permissions status
      if (permStatus !== "granted") {
        // request permissions
        const requestPerm = await Notifications.requestPermissionsAsync();
        permStatus = requestPerm.status;
      }

      // permissions denied again, exit early
      if (permStatus !== "granted") {
        return null;
      }

      // eas project
      const easId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      // validate project
      if (!easId) {
        throw Error("missing eas project id");
      }

      // expo push token
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: easId,
      });

      // store the serializable token securely
      await set("expoToken", token.data);
      setIsRegistered(true);

      return token.data;
    })();

    try {
      return await registration.current;
    } catch (error) {
      registration.current = null;
      throw Error(parseError(error));
    }
  };

  /**
   * creates a local notification, such as one generated by polling
   *
   * @param data notification data
   */
  const createLocalNotification = async (data: NotificationData) => {
    const { trigger } = data;
    const channelId = data.channelId ?? "deployments";
    const dropNotification = await areQuietHoursActive();

    // polling-generated notifications are local in every build
    //
    // save before scheduling, including notifications dropped because of quiet hours
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

  // return methods
  return { registerDevice, createLocalNotification };
};
