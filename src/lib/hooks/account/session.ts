import * as bridge from "@/lib/cooler-cloud/bridge"
import * as cloud from "@/lib/cooler-cloud/cloud"
import {
  BRIDGE_SCOPES,
  BRIDGE_SESSION_REFRESH_BUFFER_MS,
  COOLER_CLOUD_REDIRECT,
} from "@/lib/cooler-cloud/config"
import { extractAuthCode, isBridgeSessionExpired, parsePairLink } from "@/lib/cooler-cloud/session-utils"
import { getExpoPushToken } from "@/lib/hooks/notifications"
import { getNotifications, saveNotification } from "@/lib/storage/notifications"
import {
  clearPushCredentials,
  getPushCredential,
  removePushCredential,
  setPushCredential,
} from "@/lib/storage/push-credentials"
import { useAccountStore } from "@/lib/stores/account"
import { useSettingsStore } from "@/lib/stores/settings"
import { buildPushPreferences } from "@/lib/cooler-cloud/preferences"
import type { BridgeLink, BridgeSession, DevicePlatform } from "@/lib/types/account"
import * as Crypto from "expo-crypto"
import * as WebBrowser from "expo-web-browser"
import { Platform } from "react-native"

// oauth state kept between opening the browser and handling the redirect
let pendingAuthState: string | null = null

// pairings running right now, by cloud bridge id
const pairingsInFlight = new Map<string, Promise<BridgeLink>>()

/** map the runtime platform to a bridge device platform */
const devicePlatform = (): DevicePlatform | null => {
  if (Platform.OS === "ios") return "ios"
  if (Platform.OS === "android") return "android"
  return null
}

/**
 * extract the oauth code from a redirect url and verify its state
 *
 * @param url deep link the browser returned to
 *
 * @returns the authorization code
 */
export const parseAuthRedirect = (url: string): { code: string } => {
  try {
    return { code: extractAuthCode(url, pendingAuthState) }
  } finally {
    pendingAuthState = null
  }
}

/**
 * return a valid bridge session, exchanging a fresh assertion when stale
 *
 * @param link linked bridge
 *
 * @returns a live bridge session
 */
export const ensureBridgeSession = async (link: BridgeLink): Promise<BridgeSession> => {
  const store = useAccountStore.getState()
  const existing = store.bridgeSessions[link.cloudBridgeId]
  if (existing && !isBridgeSessionExpired(existing.expiresAt, BRIDGE_SESSION_REFRESH_BUFFER_MS)) {
    return existing
  }

  const session = store.session
  if (!session) throw Error("Not signed in")

  const { assertion } = await cloud.requestAccessAssertion(session.token, link.cloudBridgeId, BRIDGE_SCOPES)
  const exchanged = await bridge.exchangeAssertion(link.baseUrl, assertion)

  const bridgeSession: BridgeSession = {
    cloudBridgeId: link.cloudBridgeId,
    accessToken: exchanged.accessToken,
    expiresAt: exchanged.expiresAt,
    scopes: exchanged.scopes,
  }
  store.setBridgeSession(bridgeSession)
  return bridgeSession
}

/**
 * register this device push token with a bridge
 *
 * @param link linked bridge
 */
export const registerDevice = async (link: BridgeLink) => {
  const platform = devicePlatform()
  if (!platform) return

  const pushToken = await getExpoPushToken()
  const session = await ensureBridgeSession(link)
  const device = await bridge.registerDevice(link.baseUrl, session.accessToken, { platform, pushToken })
  useAccountStore.getState().setDeviceId(link.cloudBridgeId, device.id)

  // lets pushes be presented without a live bridge session, older bridges
  // issue no token and keep sending the content in the push themselves
  if (typeof device.eventToken === "string") {
    await setPushCredential(link.cloudBridgeId, { baseUrl: link.baseUrl, eventToken: device.eventToken })
    await sendPushPreferences(link).catch((error) =>
      console.error("[account] preference sync failed:", error)
    )
  }
}

/** push preferences built from the current settings and time zone */
const currentPushPreferences = async () => {
  // background launches can run before the settings store rehydrates
  if (!useSettingsStore.persist.hasHydrated()) await useSettingsStore.persist.rehydrate()

  return buildPushPreferences(
    useSettingsStore.getState().settings,
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )
}

/**
 * send this device's notification preferences to one bridge
 *
 * @param link linked bridge
 */
const sendPushPreferences = async (link: BridgeLink) => {
  const credential = await getPushCredential(link.cloudBridgeId)
  if (!credential) return

  await bridge.updatePreferences(credential.baseUrl, credential.eventToken, await currentPushPreferences())
}

/**
 * send this device's notification preferences to every linked bridge
 *
 * bridges hold back pushes during quiet hours and for muted alert categories,
 * so they need the latest settings and time zone; a bridge that is offline or
 * too old to accept them is retried on the next sync
 */
export const syncPushPreferences = async () => {
  const { bridges } = useAccountStore.getState()

  await Promise.allSettled(
    bridges.map((link) =>
      sendPushPreferences(link).catch((error) => console.error("[account] preference sync failed:", error))
    )
  )
}

/**
 * register this device with every linked bridge it holds no push credential for
 *
 * covers installs that registered before event tokens existed and bridges
 * paired from another device or the dashboard
 */
export const ensurePushRegistration = async () => {
  const { bridges } = useAccountStore.getState()

  await Promise.allSettled(
    bridges.map(async (link) => {
      if (await getPushCredential(link.cloudBridgeId)) return
      await registerDevice(link).catch((error) =>
        console.error("[account] device registration failed:", error)
      )
    })
  )
}

/**
 * pair a bridge to the signed in account, then register this device
 *
 * runs the bridge-orchestrated flow: create a challenge on the bridge, have the
 * cloud sign a pairing assertion for it, complete the link, have the cloud
 * confirm the round trip with the bridge, then store the bridge and register
 * this device so push can reach it
 *
 * @param input the cloud bridge id, bridge base url, and optional name
 *
 * @returns the linked bridge
 */
export const pairBridge = (input: {
  cloudBridgeId: string
  baseUrl: string
  name?: string
}): Promise<BridgeLink> => {
  // a bridge already pairing shares that run, so a double scan or a scan plus a
  // deep link never pairs twice
  const running = pairingsInFlight.get(input.cloudBridgeId)
  if (running) return running

  const run = runPairing(input).finally(() => pairingsInFlight.delete(input.cloudBridgeId))
  pairingsInFlight.set(input.cloudBridgeId, run)
  return run
}

/**
 * one full pairing run, see pairBridge
 *
 * @param input the cloud bridge id, bridge base url, and optional name
 *
 * @returns the linked bridge
 */
const runPairing = async (input: {
  cloudBridgeId: string
  baseUrl: string
  name?: string
}): Promise<BridgeLink> => {
  const store = useAccountStore.getState()
  const session = store.session
  if (!session) throw Error("Sign in to CoolerCloud before pairing a bridge")

  // challenge on the bridge, assertion from the cloud, then complete the link
  const challenge = await bridge.createPairing(input.baseUrl)
  const { assertion } = await cloud.requestPairAssertion(session.token, input.cloudBridgeId, challenge.id)
  const result = await bridge.completePairing(input.baseUrl, { code: challenge.code, assertion })

  // the cloud only counts the bridge as paired once it confirms with the bridge
  await cloud.confirmPairing(session.token, input.cloudBridgeId, challenge.id)

  const link: BridgeLink = {
    cloudBridgeId: result.cloudBridgeId,
    name: input.name ?? "Coolify",
    baseUrl: input.baseUrl,
  }

  // store the bridge, replacing any existing entry for the same id
  const others = store.bridges.filter((existing) => existing.cloudBridgeId !== link.cloudBridgeId)
  store.setBridges([...others, link])

  // register this device, a failure here shouldn't undo a successful link
  await registerDevice(link).catch((error) => console.error("[account] device registration failed:", error))

  return link
}

/**
 * unpair a bridge from the account
 *
 * stops push to this device and ends the bridge session first, best effort since
 * the bridge may be offline, then has the cloud revoke it; a bridge the cloud no
 * longer lists (unlinked from the dashboard) counts as unpaired
 *
 * @param link the bridge to unpair
 */
export const unpairBridge = async (link: BridgeLink) => {
  const store = useAccountStore.getState()
  const session = store.session
  if (!session) throw Error("Not signed in")

  try {
    const bridgeSession = await ensureBridgeSession(link)
    const deviceId = store.deviceIds[link.cloudBridgeId]
    if (deviceId) {
      await bridge.deleteDevice(link.baseUrl, bridgeSession.accessToken, deviceId).catch(() => undefined)
    }
    await bridge.bridgeLogout(link.baseUrl, bridgeSession.accessToken).catch(() => undefined)
  } catch (error) {
    console.error("[account] bridge deregistration failed:", error)
  }

  try {
    await cloud.unlinkBridge(session.token, link.cloudBridgeId)
  } catch (error) {
    const account = await cloud.getAccount(session.token)
    if (account.bridges.some((existing) => existing.cloudBridgeId === link.cloudBridgeId)) throw error
  }

  await removePushCredential(link.cloudBridgeId).catch(() => undefined)
  useAccountStore.getState().removeBridge(link.cloudBridgeId)
}

/**
 * reload the account's bridges from the cloud
 *
 * picks up bridges paired or unlinked elsewhere, such as from the dashboard
 */
export const refreshBridges = async () => {
  const session = useAccountStore.getState().session
  if (!session) return

  const account = await cloud.getAccount(session.token)

  // bridges unlinked elsewhere stop being readable from pushes
  const listed = new Set(account.bridges.map((link) => link.cloudBridgeId))
  const unlinked = useAccountStore.getState().bridges.filter((link) => !listed.has(link.cloudBridgeId))
  await Promise.allSettled(unlinked.map((link) => removePushCredential(link.cloudBridgeId)))

  useAccountStore.getState().setBridges(account.bridges)
}

/**
 * complete pairing from a scanned or opened deep link
 *
 * @param url the cooler://pair deep link
 *
 * @returns the linked bridge
 */
export const completePairingFromLink = async (url: string): Promise<BridgeLink> => {
  return pairBridge(parsePairLink(url))
}

/** archive bridge events that are not already stored, oldest first */
const archiveBridgeEvents = async (events: bridge.BridgeEvent[]) => {
  if (events.length === 0) return

  const existing = await getNotifications()
  const known = new Set(existing.map((entry) => entry.requestId).filter(Boolean))

  const ordered = [...events].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  for (const event of ordered) {
    if (known.has(event.id)) continue
    await saveNotification({
      requestId: event.id,
      title: event.title,
      body: event.message,
      data: { eventId: event.id, bridgeId: event.bridgeId, ...event.metadata },
      source: "webhook",
      delivery: "received",
    })
  }
}

/**
 * exchange an oauth code, store the session and link this device
 *
 * shared by the browser, manual code and qr flows
 *
 * @param code authorization code from coolercloud
 *
 * @returns the signed in account
 */
export const completeSignInWithCode = async (code: string) => {
  const trimmed = code.trim()
  if (!trimmed) throw Error("A sign in code is required")

  const token = await cloud.exchangeCode(trimmed)
  const account = await cloud.getAccount(token.token)

  const store = useAccountStore.getState()
  store.setSession({ token: token.token, expiresAt: token.expiresAt, user: account.user })
  store.setBridges(account.bridges)

  // register with every linked bridge so push can reach this device
  await Promise.allSettled(account.bridges.map((link) => registerDevice(link)))

  // backfill anything that arrived before this device was linked
  void syncBridgeEvents()

  return account
}

/**
 * open the coolercloud sign in page and complete the session
 *
 * @returns the signed in account
 */
export const signInWithBrowser = async () => {
  const state = Crypto.randomUUID()
  pendingAuthState = state

  const result = await WebBrowser.openAuthSessionAsync(cloud.authorizeUrl(state), COOLER_CLOUD_REDIRECT)
  if (result.type !== "success" || !result.url) {
    pendingAuthState = null
    throw Error("Sign in was cancelled")
  }

  const { code } = parseAuthRedirect(result.url)
  return completeSignInWithCode(code)
}

/** deregister devices, revoke sessions and clear the account */
export const signOut = async () => {
  const store = useAccountStore.getState()
  const { bridges, bridgeSessions, deviceIds, session } = store

  await Promise.allSettled(
    bridges.map(async (link) => {
      const bridgeSession = bridgeSessions[link.cloudBridgeId]
      if (!bridgeSession) return

      const deviceId = deviceIds[link.cloudBridgeId]
      if (deviceId) {
        await bridge.deleteDevice(link.baseUrl, bridgeSession.accessToken, deviceId).catch(() => undefined)
      }
      await bridge.bridgeLogout(link.baseUrl, bridgeSession.accessToken).catch(() => undefined)
    })
  )

  if (session) await cloud.cloudLogout(session.token).catch(() => undefined)

  await clearPushCredentials().catch(() => undefined)
  store.reset()
}

/**
 * pull recent bridge events into the local notification archive
 *
 * backfills anything delivered while the app was not in the foreground
 */
export const syncBridgeEvents = async () => {
  const store = useAccountStore.getState()

  for (const link of store.bridges) {
    try {
      const session = await ensureBridgeSession(link)
      const events = await bridge.listEvents(link.baseUrl, session.accessToken)
      await archiveBridgeEvents(events)
    } catch (error) {
      console.error("[account] event sync failed:", error)
    }
  }
}

/** coolercloud account hook exposing the sign in lifecycle */
export const useAccount = () => {
  return {
    signInWithBrowser,
    completeSignInWithCode,
    signOut,
    syncBridgeEvents,
    registerDevice,
    ensurePushRegistration,
    syncPushPreferences,
    pairBridge,
    unpairBridge,
    refreshBridges,
    completePairingFromLink,
  }
}
