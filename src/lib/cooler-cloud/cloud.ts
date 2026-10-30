import { COOLER_CLOUD_REDIRECT, COOLER_CLOUD_URL, REQUEST_TIMEOUT_MS } from "@/lib/cooler-cloud/config"
import { requestError } from "@/lib/cooler-cloud/errors"
import type { BridgeLink, CoolerCloudUser } from "@/lib/types/account"
import { ofetch } from "ofetch"

// account api lives under a version prefix, the browser authorize route does not
const API_PREFIX = "v1"

/** cloud session returned after exchanging an oauth code */
export type CloudTokenResponse = {
  token: string
  expiresAt: string
  user: CoolerCloudUser
}

/** account overview including the bridges linked to it */
export type CloudAccount = {
  user: CoolerCloudUser
  bridges: BridgeLink[]
}

type RequestOptions = {
  method?: "GET" | "POST"
  token?: string
  body?: unknown
}

/**
 * perform a request against coolercloud
 *
 * @param path api path without the version prefix
 * @param options method, bearer token and json body
 *
 * @returns parsed response body
 */
const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = "GET", token, body } = options

  try {
    return await ofetch<T>(`${COOLER_CLOUD_URL}/${API_PREFIX}/${path}`, {
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

/**
 * build the browser authorize url that returns to the app
 *
 * @param state opaque value echoed back to guard against cross site redirects
 *
 * @returns absolute authorize url
 */
export const authorizeUrl = (state: string): string => {
  const params = new URLSearchParams({
    response_type: "code",
    redirect_uri: COOLER_CLOUD_REDIRECT,
    state,
  })
  return `${COOLER_CLOUD_URL}/authorize?${params.toString()}`
}

/** exchange an oauth code for a cloud session */
export const exchangeCode = (code: string) =>
  request<CloudTokenResponse>("auth/token", {
    method: "POST",
    body: { code, redirectUri: COOLER_CLOUD_REDIRECT },
  })

/** read the account and its linked bridges */
export const getAccount = (token: string) => request<CloudAccount>("me", { token })

/** request a signed access assertion for a bridge */
export const requestAccessAssertion = (token: string, cloudBridgeId: string, scope: string[]) =>
  request<{ assertion: string }>(`bridges/${cloudBridgeId}/assertions/access`, {
    method: "POST",
    token,
    body: { scope },
  })

/** request a signed pairing assertion for a bridge challenge */
export const requestPairAssertion = (token: string, cloudBridgeId: string, pairingId: string) =>
  request<{ assertion: string }>(`bridges/${cloudBridgeId}/assertions/pair`, {
    method: "POST",
    token,
    body: { pairingId },
  })

/** revoke the cloud session */
export const cloudLogout = (token: string) =>
  request<{ loggedOut: boolean }>("auth/logout", { method: "POST", token })
