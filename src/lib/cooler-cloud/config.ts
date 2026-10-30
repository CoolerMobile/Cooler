import Constants from "expo-constants"

/**
 * coolercloud account service base url
 *
 * defaults to the hosted cloud but can be overridden for local emulation
 * through the EXPO_PUBLIC_COOLER_CLOUD_URL env var or app config extra
 */
export const COOLER_CLOUD_URL =
  process.env.EXPO_PUBLIC_COOLER_CLOUD_URL ??
  (Constants.expoConfig?.extra?.coolerCloud?.baseUrl as string | undefined) ??
  "https://cloud.getcooler.app"

/** deep link the oauth flow returns to */
export const COOLER_CLOUD_REDIRECT = "cooler://auth"

/** bridge scopes the app needs for push registration and event access */
export const BRIDGE_SCOPES = ["events:read", "devices:read", "devices:write"]

/**
 * how long before a bridge session expiry we treat it as stale
 *
 * re-exchanging a little early avoids racing the hard one hour cutoff
 */
export const BRIDGE_SESSION_REFRESH_BUFFER_MS = 60_000

/** shared request timeout for cloud and bridge calls */
export const REQUEST_TIMEOUT_MS = 15_000
