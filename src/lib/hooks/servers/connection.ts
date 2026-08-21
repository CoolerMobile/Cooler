import { normalizeUrl, parseError } from "@/lib/utils"
import { ofetch } from "ofetch"
import { useSecureStorage } from "@/lib/hooks/secure"
import { useDataStore } from "@/lib/stores/data"
import * as Crypto from "expo-crypto"

// variables
const HEALTH_ENDPOINT = "api/v1/health"
const VERSION_ENDPOINT = "api/v1/version"

// validation data
type ServerHealth = "ok" | "invalid_token" | "unauthenticated" | "invalid_data" | "unknown"
export type ServerData = {
  id: string
  nickname: string
  endpoint: string
  token: string
  version: string
  health: ServerHealth
}

/**
 * coolify server hook for all server operations
 */
export const useServer = () => {
  // secure storage
  const { get: getSecure, set: setSecure } = useSecureStorage()

  /**
   * validates a connection using provided values
   *
   * @param address coolify server address
   * @param apiKey coolify api key
   *
   * @returns whether the connection was successful or not
   */
  const validate = async ({
    nickname,
    endpoint,
    token,
  }: {
    nickname: string
    endpoint: string
    token: string
  }): Promise<Omit<ServerData, "id">> => {
    // validate input
    if (!endpoint || !token) throw Error("missing data for connection validation")

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

    // parse version
    const parseVersion = (version: string): string => {
      // validate input
      if (!version) return "unknown"

      // per response
      if (version.includes("token")) return "invalid_token"
      if (version.includes("Unauthenticated")) return "unauthenticated"

      // return version
      return version
    }

    // normalize address
    //
    // - force https
    // - remove directory index (index.php, etc)
    // - remove path so only hostname remains
    endpoint = normalizeUrl(endpoint)

    // attempt to validate connection
    try {
      // checks
      const healthResponse = await ofetch(`${endpoint}/${HEALTH_ENDPOINT}`)
      const versionResponse = await ofetch(`${endpoint}/${VERSION_ENDPOINT}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      // validation data
      const data: Omit<ServerData, "id"> = {
        nickname,
        endpoint,
        token,
        health: parseHealth(healthResponse.toString()),
        version: parseVersion(versionResponse.toString()),
      }

      // return validation data
      return data
    } catch (error) {
      throw Error(parseError(error))
    }
  }

  /**
   * securely add server to internal database
   *
   * @param server server details
   *
   * @returns whether the server was added or not
   */
  const create = async (server: Omit<ServerData, "id" | "version" | "health">) => {
    // validate server data
    if (!server) throw Error("invalid server data")

    // validate server health
    const valid = await validate(server)

    // servers
    const storedServers = await getSecure("servers")
    const servers: ServerData[] = storedServers ? JSON.parse(storedServers) : []

    // validate server existence
    if (servers.some((serverItem) => serverItem.endpoint === valid.endpoint)) {
      throw Error("server already added")
    }

    // complete server data
    const serverData: ServerData = {
      ...valid,
      id: Crypto.randomUUID(),
    }

    // add server to secure storage
    const nextServers = [...servers, serverData]
    const serverAdded = await setSecure("servers", JSON.stringify(nextServers))

    // keep the live store in sync with the established SecureStore flow so
    // subscribed screens update immediately after a successful write
    if (serverAdded) useDataStore.getState().setServers(nextServers)

    // return success or failure
    return serverAdded
  }

  // return methods
  return { validate, create }
}
