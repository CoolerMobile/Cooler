import { secureStorage } from "@/lib/hooks/secure";

// key & prefix
const NOTIFICATION_SEQUENCE_KEY = "cooler.notifications.sequence";
const NOTIFICATION_ENTRY_PREFIX = "cooler.notifications.entry";

export type NotificationStorageInput = {
  requestId?: string;
  title: string | undefined;
  body: string | undefined;
  data?: Record<string, unknown>;
  channelId?: string;
  source: "local" | "webhook";
  delivery: NotificationDelivery;
};

type NotificationDelivery = "dropped" | "failed" | "generated" | "received";

export type StoredNotification = NotificationStorageInput & {
  id: number;
  savedAt: string;
  deliveredAt?: string;
};

// serialize writes so concurrent notification events cannot claim the same id
let writeQueue: Promise<unknown> = Promise.resolve();
const entryKey = (id: number) => `${NOTIFICATION_ENTRY_PREFIX}.${id}`;

/**
 * append a notification to the local encrypted notification database
 *
 * entries are intentionally write-only here
 * a future reader can use the secure sequence value
 * to address entries without maintaining a large index
 */
export const saveNotification = async (input: NotificationStorageInput) => {
  const write = writeQueue.then(async () => {
    const storedSequence = await secureStorage.getItem(
      NOTIFICATION_SEQUENCE_KEY,
    );
    const parsedSequence = Number.parseInt(storedSequence ?? "0", 10);
    const id = Number.isSafeInteger(parsedSequence) ? parsedSequence + 1 : 1;
    const notification: StoredNotification = {
      ...input,
      id,
      savedAt: new Date().toISOString(),
    };

    // reserve the id before writing the entry
    //
    // a failed entry write can leave a harmless gap,
    // but a later notification can never overwrite it
    await secureStorage.setItem(NOTIFICATION_SEQUENCE_KEY, String(id));
    await secureStorage.setItem(entryKey(id), JSON.stringify(notification));

    return id;
  });

  writeQueue = write.catch(() => undefined);
  return write;
};

/**
 * update a locally-generated notification
 */
export const markNotificationDelivery = async (
  id: number,
  delivery: Exclude<NotificationDelivery, "generated">,
) => {
  const write = writeQueue.then(async () => {
    const storedValue = await secureStorage.getItem(entryKey(id));
    if (storedValue === null) {
      throw new Error(`[notifications] missing stored notification ${id}`);
    }

    const notification = JSON.parse(storedValue) as StoredNotification;
    await secureStorage.setItem(
      entryKey(id),
      JSON.stringify({
        ...notification,
        delivery,
        deliveredAt: new Date().toISOString(),
      } satisfies StoredNotification),
    );
  });

  writeQueue = write.catch(() => undefined);
  return write;
};

/**
 * get all notifications
 *
 * @returns array of notifications
 */
export const getNotifications = async () => {
  // wait for pending writes so a reserved sequence always has a chance to finish
  await writeQueue;

  // validate sequence
  const storedSequence = await secureStorage.getItem(NOTIFICATION_SEQUENCE_KEY);
  const sequence = Number.parseInt(storedSequence ?? "0", 10);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return [];

  // resolve stored notifications
  const storedNotifications = await Promise.all(
    Array.from({ length: sequence }, (_, index) =>
      secureStorage.getItem(entryKey(index + 1)),
    ),
  );

  // return notifications as normalized map
  return storedNotifications.flatMap((storedValue) =>
    storedValue === null ? [] : [JSON.parse(storedValue) as StoredNotification],
  );
};
