import { parseError } from "@/lib/utils"
import { ofetch } from "ofetch"
import normalizeUrl from "normalize-url"

// variables
const HEALTH_ENDPOINT = "api/v1/health"
const VERSION_ENDPOINT = "api/v1/version"

// validation data
type ServerHealth = "ok" | "invalid_token" | "unauthenticated" | "invalid_data" | "unknown"
type ValidationData = {
  healthStatus: ServerHealth
  version: string
}

/**
 * coolify server hook for all server operations
 */
export const useServer = () => {
  /**
   * validates a connection using provided values
   *
   * @param address coolify server address
   * @param apiKey coolify api key
   *
   * @returns whether the connection was successful or not
   */
  const validate = async ({ address, apiKey }: { address: string; apiKey: string }) => {
    // validate input
    if (!address || !apiKey) throw Error("missing data for connection validation")

    // parse health
    const parseHealth = (health: string): ServerHealth => {
      // validate input
      if (!health) return "invalid_data"

      // per response
      if (health === "OK") return "ok"
      if (health.includes("token")) return "invalid_token"
      if (health.includes("Unauthenticated")) return "unauthenticated"

      // default status
      // unknown
      return "unknown"
    }

    // normalize address
    //
    // - force https
    // - remove directory index (index.php, etc)
    // - remove path so only hostname remains
    address = normalizeUrl(address, {
      defaultProtocol: "https",
      forceHttps: true,
      removeDirectoryIndex: true,
      removePath: true,
    })

    // attempt to validate connection
    try {
      // checks
      const healthResponse = await ofetch(`${address}/${HEALTH_ENDPOINT}`)
      const versionResponse = await ofetch(`${address}/${VERSION_ENDPOINT}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })

      // validation data
      const data: ValidationData = {
        healthStatus: parseHealth(healthResponse.toString()),
        version: versionResponse,
      }

      // debug: log validation data
      console.debug("[server] validation data:", data)
    } catch (error) {
      throw Error(parseError(error))
    }
  }

  // return methods
  return { validate }
}
