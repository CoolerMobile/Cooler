import { DemoEngine } from "@/lib/demo/engine"
import { DEMO_COOLIFY_VERSION, isDemoConnectionId, isDemoEndpoint, isDemoToken } from "@/lib/demo/fixtures"

// simulated network latency so loading states behave like the real thing
const MIN_LATENCY_MS = 180
const MAX_LATENCY_MS = 520

let engine: DemoEngine | null = null
let demoModeActive = false
let requestSequence = 0

/**
 * the shared demo engine, created on first use
 *
 * @returns demo engine
 */
export const getDemoEngine = (): DemoEngine => (engine ??= new DemoEngine())

/** drop the demo engine so the next use starts fresh */
export const resetDemoEngine = () => {
  engine = null
}

/**
 * mirror the persisted demo flag
 *
 * kept here instead of reading the store so the network clients stay free of
 * native imports
 *
 * @param active whether demo mode is on
 */
export const setDemoModeActive = (active: boolean) => {
  demoModeActive = active
}

/** whether demo mode is on */
export const isDemoModeActive = (): boolean => demoModeActive

/**
 * whether a coolify connection is served by the demo
 *
 * keyed on the connection itself, so demo data never reaches the network even
 * before the demo flag rehydrates
 *
 * @param server saved connection
 *
 * @returns true for demo connections
 */
export const isDemoServer = (server: { id: string; endpoint: string }): boolean =>
  isDemoConnectionId(server.id) || isDemoEndpoint(server.endpoint)

/**
 * whether a coolercloud request is served by the demo
 *
 * @param token bearer token, if any
 *
 * @returns true in demo mode or for demo tokens
 */
export const shouldUseDemoCloud = (token?: string): boolean => demoModeActive || isDemoToken(token)

/**
 * whether a coolerbridge request is served by the demo
 *
 * @param baseUrl bridge base url
 * @param token bearer token, if any
 *
 * @returns true in demo mode, for demo bridges or for demo tokens
 */
export const shouldUseDemoBridge = (baseUrl: string, token?: string): boolean =>
  demoModeActive || isDemoEndpoint(baseUrl) || isDemoToken(token)

/**
 * wait a short, varying time like a real request would
 *
 * @param signal aborts the wait
 */
const latency = (signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const abortError = () => Object.assign(Error("The demo request was aborted"), { name: "AbortError" })
    if (signal?.aborted) {
      reject(abortError())
      return
    }

    const spread = MAX_LATENCY_MS - MIN_LATENCY_MS
    const delay = MIN_LATENCY_MS + ((requestSequence++ * 137) % spread)
    const abort = () => {
      clearTimeout(timeout)
      reject(abortError())
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort)
      resolve()
    }, delay)

    signal?.addEventListener("abort", abort, { once: true })
  })

/**
 * answer a coolify api request from the demo
 *
 * @param server saved demo connection
 * @param path path below /api/v1, with any query
 * @param options method, body and abort signal
 *
 * @returns the response body
 */
export const demoCoolifyRequest = async <T>(
  server: { id: string },
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> => {
  await latency(options.signal)
  return getDemoEngine().coolify(server.id, { method: options.method, path, body: options.body }) as T
}

/**
 * answer a coolercloud api request from the demo
 *
 * @param path path below /v1
 * @param options method, token and body
 *
 * @returns the response body
 */
export const demoCloudRequest = async <T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> => {
  await latency()
  return getDemoEngine().cloud({ path, ...options }) as T
}

/**
 * answer a coolerbridge api request from the demo
 *
 * @param baseUrl bridge base url
 * @param path path below /v1
 * @param options method, token and body
 *
 * @returns the response body
 */
export const demoBridgeRequest = async <T>(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> => {
  await latency()
  return getDemoEngine().bridge(baseUrl, { path, ...options }) as T
}

/**
 * health and version checks for a connection added while in demo mode
 *
 * only demo hosts can be added, anything else would reach a real server
 *
 * @param endpoint normalized server address
 *
 * @returns the raw health and version answers
 */
export const demoConnectionCheck = async (endpoint: string): Promise<{ health: string; version: string }> => {
  if (!isDemoEndpoint(endpoint)) {
    throw Error("You're in the demo. Exit it in Settings to connect your own Coolify server.")
  }

  await latency()
  return { health: "OK", version: DEMO_COOLIFY_VERSION }
}
