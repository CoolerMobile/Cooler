// pure helpers for the account flow, kept free of native imports so they can be
// unit tested in isolation

/** parse a url query string into a flat map */
const parseQuery = (url: string): Record<string, string> => {
  const queryStart = url.indexOf("?")
  if (queryStart < 0) return {}

  const params: Record<string, string> = {}
  for (const pair of url.slice(queryStart + 1).split("&")) {
    if (!pair) continue
    const [key, value = ""] = pair.split("=")
    params[decodeURIComponent(key)] = decodeURIComponent(value)
  }
  return params
}

/**
 * extract the oauth code from a redirect url and verify its state
 *
 * @param url redirect url the browser returned to
 * @param expectedState state issued when the flow started, when set it must match
 *
 * @returns the authorization code
 */
export const extractAuthCode = (url: string, expectedState?: string | null): string => {
  const params = parseQuery(url)

  if (expectedState && params.state !== expectedState) {
    throw Error("Sign in could not be verified")
  }
  if (!params.code) throw Error("Sign in did not return a code")

  return params.code
}

/**
 * whether a bridge session is within the refresh buffer of expiring
 *
 * @param expiresAt session expiry timestamp
 * @param bufferMs how long before expiry a session is treated as stale
 * @param now current time, injectable for tests
 *
 * @returns whether the session should be refreshed
 */
export const isBridgeSessionExpired = (expiresAt: string, bufferMs: number, now = Date.now()): boolean =>
  new Date(expiresAt).getTime() - now <= bufferMs

/**
 * pull a sign in code out of a scanned value that may be a deep link
 *
 * @param scanned raw scanned string
 *
 * @returns a trimmed code, or empty string when none is present
 */
export const codeFromScan = (scanned: string): string => {
  if (scanned.includes("://")) {
    try {
      return extractAuthCode(scanned)
    } catch {
      return ""
    }
  }
  return scanned.trim()
}

/**
 * whether a scanned value or url is a cooler bridge pairing deep link
 *
 * @param value raw scanned string or url
 *
 * @returns whether it carries the pairing params
 */
export const isPairLink = (value: string): boolean => {
  if (!value.includes("://")) return false
  const params = parseQuery(value)
  return Boolean(params.bridge && params.url)
}

/**
 * parse a cooler bridge pairing deep link
 *
 * @param url the cooler://pair deep link
 *
 * @returns the cloud bridge id, bridge base url, and optional name
 */
export const parsePairLink = (url: string): { cloudBridgeId: string; baseUrl: string; name?: string } => {
  const params = parseQuery(url)
  const cloudBridgeId = params.bridge
  const baseUrl = params.url

  if (!cloudBridgeId || !baseUrl) throw Error("That link is not a valid bridge pairing link")

  return { cloudBridgeId, baseUrl, name: params.name || undefined }
}
