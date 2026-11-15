import Constants from "expo-constants"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"

// keychain item the ios notification service extension reads, keep in sync
// with plugins/notification-service/NotificationService.swift
const PUSH_CREDENTIALS_SERVICE = "cooler.push"
const PUSH_CREDENTIALS_KEY = "cooler.push.credentials"

/** what a device needs to read the events it is pushed from one bridge */
export type PushCredential = {
  baseUrl: string
  eventToken: string
}

type PushCredentials = Record<string, PushCredential>

/**
 * keychain group shared with the notification service extension
 *
 * mirrors the `$(AppIdentifierPrefix)<bundle id>.push` entitlement
 */
const accessGroup = () => {
  const ios = Constants.expoConfig?.ios
  if (Platform.OS !== "ios" || !ios?.appleTeamId || !ios.bundleIdentifier) return undefined

  return `${ios.appleTeamId}.${ios.bundleIdentifier}.push`
}

const options = (): SecureStore.SecureStoreOptions => ({
  keychainService: PUSH_CREDENTIALS_SERVICE,
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  accessGroup: accessGroup(),
})

// serialize writes so parallel registrations cannot drop each other
let writeQueue: Promise<unknown> = Promise.resolve()

/** read every stored push credential, keyed by cloud bridge id */
const readAll = async (): Promise<PushCredentials> => {
  const stored = await SecureStore.getItemAsync(PUSH_CREDENTIALS_KEY, options())
  if (!stored) return {}

  try {
    return JSON.parse(stored) as PushCredentials
  } catch {
    return {}
  }
}

/**
 * apply a change to the stored push credentials
 *
 * @param change returns the next credentials from the current ones
 */
const update = (change: (credentials: PushCredentials) => PushCredentials) => {
  const write = writeQueue.then(async () => {
    const next = change(await readAll())

    if (Object.keys(next).length === 0) {
      await SecureStore.deleteItemAsync(PUSH_CREDENTIALS_KEY, options())
      return
    }

    await SecureStore.setItemAsync(PUSH_CREDENTIALS_KEY, JSON.stringify(next), options())
  })

  writeQueue = write.catch(() => undefined)
  return write
}

/**
 * read the push credential for a bridge
 *
 * @param cloudBridgeId cloud bridge id the push names
 *
 * @returns the credential or null when this device holds none
 */
export const getPushCredential = async (cloudBridgeId: string): Promise<PushCredential | null> => {
  await writeQueue
  return (await readAll())[cloudBridgeId] ?? null
}

/**
 * store the push credential for a bridge
 *
 * @param cloudBridgeId cloud bridge id
 * @param credential bridge base url and device event token
 */
export const setPushCredential = (cloudBridgeId: string, credential: PushCredential) =>
  update((credentials) => ({ ...credentials, [cloudBridgeId]: credential }))

/**
 * forget the push credential for a bridge
 *
 * @param cloudBridgeId cloud bridge id
 */
export const removePushCredential = (cloudBridgeId: string) =>
  update(({ [cloudBridgeId]: _, ...credentials }) => credentials)

/** forget every push credential */
export const clearPushCredentials = () => update(() => ({}))
