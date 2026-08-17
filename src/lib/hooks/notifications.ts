import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { parseError } from "@/lib/utils";
import { useSecureStorage } from "@/lib/hooks/secure";
import { useEffect, useRef, useState } from "react";

// notification data
type NotificationData = {
  to: string;
  sound?: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  trigger?: Notifications.TimeIntervalTriggerInput;
};

// handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
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

      // reuse an established Expo token
      const storedToken = await get("expoToken");
      if (
        typeof storedToken === "string" &&
        /^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(storedToken)
      ) {
        setIsRegistered(true);
        return storedToken;
      }

      // android channels
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("deployments", {
          name: "Deployments",
          importance: Notifications.AndroidImportance.HIGH,
        });
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
   * sends a notification to device with matching `expoToken`
   *
   * @param data notification data
   */
  const sendNotification = async (data: NotificationData) => {
    // dev notification
    if (process.env.NODE_ENV === "development") {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: data.title,
          body: data.body,
          data: {
            type: "deployment",
            resourceId: "test-resource",
          },
        },
        trigger: data.trigger ?? {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 2,
        },
      });
    }

    // prod notification
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  };

  // return methods
  return { registerDevice, sendNotification };
};
