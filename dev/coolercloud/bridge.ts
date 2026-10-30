// thin coolerbridge client for the emulation scripts, decoupled from the app

const API_PREFIX = "v1"

export type BridgeResponse<T> = {
  status: number
  ok: boolean
  data: T
}

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE"
  token?: string
  body?: unknown
}

/**
 * call a bridge endpoint and return status alongside the parsed body
 *
 * never throws on a non ok status so failure flows can assert on it
 *
 * @param baseUrl bridge base url
 * @param path path without the version prefix
 * @param options method, bearer token and json body
 *
 * @returns status, ok flag and parsed body
 */
export const call = async <T = unknown>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {}
): Promise<BridgeResponse<T>> => {
  const { method = "GET", token, body } = options

  const response = await fetch(`${baseUrl}/${API_PREFIX}/${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  return { status: response.status, ok: response.ok, data: data as T }
}

/** provision a new bridge, returning its uuid and webhook url */
export const createBridge = (baseUrl: string, name = "Emulated Coolify") =>
  call<{ id: string; name: string; createdAt: string; webhookUrl: string }>(baseUrl, "bridges", {
    method: "POST",
    body: { name },
  })

/** create a pairing challenge */
export const createPairing = (baseUrl: string) =>
  call<{ id: string; code: string; expiresAt: string }>(baseUrl, "pairing", { method: "POST" })

/** complete pairing with a signed assertion */
export const completePairing = (baseUrl: string, body: { code: string; assertion: string }) =>
  call<{ linked: boolean; cloudBridgeId: string }>(baseUrl, "pairing/complete", { method: "POST", body })

/** exchange a cloud access assertion for a bridge session */
export const exchange = (baseUrl: string, assertion: string) =>
  call<{ accessToken: string; tokenType: string; expiresAt: string; scopes: string[] }>(
    baseUrl,
    "auth/exchange",
    { method: "POST", body: { assertion } }
  )

/** register a push device */
export const registerDevice = (
  baseUrl: string,
  token: string,
  deviceData: { platform: "ios" | "android"; pushToken: string }
) => call<{ id: string }>(baseUrl, "devices", { method: "POST", token, body: { deviceData } })

/** list events for the linked bridge */
export const listEvents = (baseUrl: string, token: string) => call<unknown[]>(baseUrl, "events", { token })

/**
 * deliver a coolify style webhook to the bridge ingestion endpoint
 *
 * @param baseUrl bridge base url
 * @param webhookPath webhook path returned when the bridge was created
 * @param payload coolify webhook body
 */
export const sendWebhook = async (baseUrl: string, webhookPath: string, payload: unknown) => {
  const response = await fetch(`${baseUrl}${webhookPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  return { status: response.status, ok: response.ok, data: text ? JSON.parse(text) : null }
}
