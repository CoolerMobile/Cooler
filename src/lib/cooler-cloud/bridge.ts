import { REQUEST_TIMEOUT_MS } from "@/lib/cooler-cloud/config"
import { requestError } from "@/lib/cooler-cloud/errors"
import type { DevicePlatform } from "@/lib/types/account"
import { ofetch } from "ofetch"

// coolerbridge mounts its app api under a static version prefix
const API_PREFIX = "v1"

/** registered push device as stored by the bridge */
export type BridgeDevice = {
  id: string
  cloudLinkId: string
  platform: DevicePlatform
  pushToken: string
  createdAt: string
  lastSeenAt: string | null
  revokedAt: string | null
}

/** severity levels a normalized event can carry */
export type BridgeEventSeverity = "info" | "success" | "warning" | "error"

/** normalized coolify event stored by the bridge */
export type BridgeEvent = {
  id: string
  bridgeId: string
  type: string
  severity: BridgeEventSeverity
  title: string
  message: string
  resourceType: "application" | "database" | "server" | "container" | null
  resourceId: string | null
  resourceName: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

/** opaque bridge session returned by an assertion exchange */
export type BridgeAuthSession = {
  accessToken: string
  tokenType: string
  expiresAt: string
  scopes: string[]
}

/** short lived pairing challenge created on the bridge */
export type PairingChallenge = {
  id: string
  code: string
  expiresAt: string
}

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE"
  token?: string
  body?: unknown
}

/**
 * perform a request against a bridge
 *
 * @param baseUrl bridge public base url
 * @param path api path without the version prefix
 * @param options method, bearer token and json body
 *
 * @returns parsed response body
 */
const request = async <T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = "GET", token, body } = options

  try {
    return await ofetch<T>(`${baseUrl}/${API_PREFIX}/${path}`, {
      method,
      body: body as Record<string, unknown> | undefined,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
      retry: 0,
      timeout: REQUEST_TIMEOUT_MS,
    })
  } catch (error) {
    throw Error(requestError(error))
  }
}

/** create a pairing challenge to link a bridge to a cloud account */
export const createPairing = (baseUrl: string) =>
  request<PairingChallenge>(baseUrl, "pairing", { method: "POST" })

/** complete pairing with a cloud signed pairing assertion */
export const completePairing = (baseUrl: string, input: { code: string; assertion: string }) =>
  request<{ linked: boolean; cloudBridgeId: string }>(baseUrl, "pairing/complete", {
    method: "POST",
    body: input,
  })

/** exchange a cloud access assertion for a bridge session */
export const exchangeAssertion = (baseUrl: string, assertion: string) =>
  request<BridgeAuthSession>(baseUrl, "auth/exchange", { method: "POST", body: { assertion } })

/** read the current bridge session */
export const bridgeMe = (baseUrl: string, token: string) =>
  request<{ sessionId: string; scopes: string[]; expiresAt: string }>(baseUrl, "auth/me", { token })

/** revoke the current bridge session */
export const bridgeLogout = (baseUrl: string, token: string) =>
  request<{ loggedOut: boolean }>(baseUrl, "auth/logout", { method: "POST", token })

/** list devices registered for this account on the bridge */
export const listDevices = (baseUrl: string, token: string) =>
  request<BridgeDevice[]>(baseUrl, "devices", { token })

/** register this device push token with the bridge */
export const registerDevice = (
  baseUrl: string,
  token: string,
  deviceData: { platform: DevicePlatform; pushToken: string }
) => request<BridgeDevice>(baseUrl, "devices", { method: "POST", token, body: { deviceData } })

/** deregister a device by id */
export const deleteDevice = (baseUrl: string, token: string, id: string) =>
  request<{ deviceId: string; deleted: boolean }>(baseUrl, `devices/${id}`, { method: "DELETE", token })

/** list recent events for the linked bridge */
export const listEvents = (baseUrl: string, token: string) =>
  request<BridgeEvent[]>(baseUrl, "events", { token })

/** read a single event by id */
export const getEvent = (baseUrl: string, token: string, id: string) =>
  request<BridgeEvent>(baseUrl, `events/${id}`, { token })
