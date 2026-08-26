import type { ServerData } from "@/lib/hooks/servers/connection"
import { normalizeResourceStatus } from "@/lib/coolify/status"
import { useDataStore } from "@/lib/stores/data"
import type { Instance, Resource } from "@/lib/types/coolify"
import { ofetch } from "ofetch"
import { useEffect } from "react"
import { AppState } from "react-native"

const API_PREFIX = "api/v1"
const REFRESH_INTERVAL_MS = 60_000
const REQUEST_TIMEOUT_MS = 15_000

type CoolifyServer = {
  id?: unknown
  uuid?: unknown
  name?: unknown
  description?: unknown
  settings?: {
    is_reachable?: unknown
    is_usable?: unknown
  } | null
}

type CoolifyResource = {
  id?: unknown
  uuid?: unknown
  name?: unknown
  type?: unknown
  status?: unknown
}

type ConnectionSnapshot = {
  instances: Instance[]
  resources: Resource[]
  failed: boolean
}

const scopedId = (connectionId: string, ...parts: string[]) => [connectionId, ...parts].join(":")

const readArray = <T>(value: unknown, collectionName: string): T[] => {
  if (!Array.isArray(value)) {
    throw Error(`Coolify returned invalid ${collectionName} data`)
  }

  return value as T[]
}

const normalizedText = (value: unknown, fallback = ""): string =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() || fallback : fallback

const coolifyId = (item: { id?: unknown; uuid?: unknown }, collectionName: string): string => {
  const value = normalizedText(item.uuid) || normalizedText(item.id)
  if (!value) throw Error(`Coolify returned a ${collectionName} item without an id`)

  return value
}

const isEnabled = (value: unknown): boolean =>
  value !== false && value !== 0 && value !== "0" && value !== "false"

const request = async <T>(server: ServerData, path: string): Promise<T> =>
  ofetch<T>(`${server.endpoint}/${API_PREFIX}/${path}`, {
    headers: { Authorization: `Bearer ${server.token}` },
    retry: 0,
    timeout: REQUEST_TIMEOUT_MS,
  })

const unavailableResources = (resources: Resource[]): Resource[] =>
  resources.map((resource) => ({ ...resource, isReachable: false }))

const unavailableInstances = (instances: Instance[]): Instance[] =>
  instances.map((instance) => ({ ...instance, isReachable: false }))

const syncConnection = async (
  connection: ServerData,
  previousInstances: Instance[],
  previousResources: Resource[]
): Promise<ConnectionSnapshot> => {
  let response: unknown
  try {
    response = await request<unknown>(connection, "servers")
  } catch {
    return {
      instances: unavailableInstances(previousInstances),
      resources: unavailableResources(previousResources),
      failed: true,
    }
  }

  let coolifyServers: CoolifyServer[]
  try {
    coolifyServers = readArray<CoolifyServer>(response, "servers")
  } catch {
    return {
      instances: unavailableInstances(previousInstances),
      resources: unavailableResources(previousResources),
      failed: true,
    }
  }

  const results = await Promise.all(
    coolifyServers.map(async (coolifyServer) => {
      let uuid: string
      try {
        uuid = coolifyId(coolifyServer, "server")
      } catch {
        return { instance: null, resources: [] as Resource[], failed: true }
      }

      const instanceId = scopedId(connection.id, uuid)
      const reportedReachable =
        isEnabled(coolifyServer.settings?.is_reachable) && isEnabled(coolifyServer.settings?.is_usable)
      const instance: Instance = {
        id: instanceId,
        uuid,
        connectionId: connection.id,
        name: normalizedText(coolifyServer.name, uuid),
        description: normalizedText(coolifyServer.description),
        isReachable: reportedReachable,
      }

      try {
        const resourceResponse = await request<unknown>(
          connection,
          `servers/${encodeURIComponent(uuid)}/resources`
        )
        const coolifyResources = readArray<CoolifyResource>(resourceResponse, "resources")
        let hasMalformedResource = false
        const resources = coolifyResources.flatMap<Resource>((coolifyResource) => {
          try {
            const resourceUuid = coolifyId(coolifyResource, "resource")
            const rawStatus = normalizedText(coolifyResource.status, "unknown")
            return [
              {
                id: scopedId(connection.id, uuid, resourceUuid),
                uuid: resourceUuid,
                connectionId: connection.id,
                instanceId,
                name: normalizedText(coolifyResource.name, resourceUuid),
                type: normalizedText(coolifyResource.type, "unknown").toLowerCase(),
                rawStatus,
                status: normalizeResourceStatus(rawStatus),
                // Coolify does not expose resource criticality. Monitoring errs on
                // the safe side until Cooler offers a user-controlled override.
                isCritical: true,
                isReachable: reportedReachable,
              },
            ]
          } catch {
            hasMalformedResource = true
            return []
          }
        })

        return { instance, resources, failed: hasMalformedResource }
      } catch {
        return {
          instance: { ...instance, isReachable: false },
          resources: unavailableResources(
            previousResources.filter((resource) => resource.instanceId === instanceId)
          ),
          failed: true,
        }
      }
    })
  )

  return {
    instances: results.flatMap(({ instance }) => (instance ? [instance] : [])),
    resources: results.flatMap(({ resources }) => resources),
    failed: results.some(({ failed }) => failed),
  }
}

let activeSync: Promise<void> | null = null
let syncRequested = false

const performCoolifySync = async () => {
  const state = useDataStore.getState()
  if (!state.hasHydrated) return

  const snapshots = await Promise.all(
    state.servers.map((connection) =>
      syncConnection(
        connection,
        state.instances.filter((instance) => instance.connectionId === connection.id),
        state.resources.filter((resource) => resource.connectionId === connection.id)
      )
    )
  )

  useDataStore.getState().setInfrastructure({
    instances: snapshots.flatMap(({ instances }) => instances),
    resources: snapshots.flatMap(({ resources }) => resources),
    failedServerIds: snapshots.flatMap((snapshot, index) =>
      snapshot.failed ? [state.servers[index].id] : []
    ),
    lastSyncedAt: Date.now(),
  })
}

/** Refreshes every saved Coolify connection and atomically publishes one snapshot. */
export const refreshCoolifyData = async (): Promise<void> => {
  if (activeSync) {
    syncRequested = true
    return activeSync
  }

  activeSync = (async () => {
    do {
      syncRequested = false
      await performCoolifySync()
    } while (syncRequested)
  })().finally(() => {
    activeSync = null
  })

  return activeSync
}

/** Keeps Coolify data fresh while the application is in the foreground. */
export const useCoolifyMonitor = () => {
  const hasHydrated = useDataStore((state) => state.hasHydrated)
  const servers = useDataStore((state) => state.servers)

  useEffect(() => {
    if (!hasHydrated) return

    void refreshCoolifyData()

    const interval = setInterval(() => {
      if (AppState.currentState === "active") void refreshCoolifyData()
    }, REFRESH_INTERVAL_MS)
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void refreshCoolifyData()
    })

    return () => {
      clearInterval(interval)
      appStateSubscription.remove()
    }
  }, [hasHydrated, servers])
}
