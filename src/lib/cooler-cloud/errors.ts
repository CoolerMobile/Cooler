import { parseError } from "@/lib/utils"
import { FetchError } from "ofetch"

/**
 * turn a failed cloud or bridge request into a readable message
 *
 * both services answer errors with an { error } body so we surface that when
 * present and fall back to the generic parser otherwise
 *
 * @param error thrown request error
 *
 * @returns readable message
 */
export const requestError = (error: unknown): string => {
  if (error instanceof FetchError) {
    const body = error.data as { error?: string } | undefined
    if (body?.error) return body.error
  }

  return parseError(error)
}
