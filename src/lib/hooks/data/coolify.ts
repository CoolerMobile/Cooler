import type { ServerData } from "@/lib/hooks/servers/connection"
import { normalizeResourceStatus } from "@/lib/coolify/status"
import { useDataStore } from "@/lib/stores/data"
import type { Instance, Resource, ResourceLog } from "@/lib/types/coolify"
import { FetchError, ofetch } from "ofetch"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"

const API_PREFIX = "api/v1"
const REFRESH_INTERVAL_MS = 60_000
const RESOURCE_LOG_REFRESH_INTERVAL_MS = 2_000
const REQUEST_TIMEOUT_MS = 15_000
const RESOURCE_LOG_LINES = 100

const HTTP_STATUS_LABELS: Partial<Record<number, string>> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  408: "Request Timeout",
  409: "Conflict",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
}

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

type CoolifyProject = {
  id?: unknown
  uuid?: unknown
  name?: unknown
}

type CoolifyEnvironment = {
  id?: unknown
  uuid?: unknown
  name?: unknown
}

type CoolifyResourceOwnership = {
  id?: unknown
  uuid?: unknown
  environment_id?: unknown
}

type CoolifyLogs = {
  logs?: unknown
}

type CoolifyServiceSubResource = {
  name?: unknown
}

type CoolifyService = {
  applications?: unknown
  databases?: unknown
}

type ResourceProject = Pick<Resource, "projectId" | "projectUuid" | "projectName" | "environmentName">

type ConnectionSnapshot = {
  instances: Instance[]
  resources: Resource[]
  failed: boolean
}

type ResourceLogsSnapshot = Pick<Resource, "logs" | "logsUpdatedAt">

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

const logsPath = (resourceType: string, resourceUuid: string): string | null => {
  const uuid = encodeURIComponent(resourceUuid)

  if (resourceType === "application") return `applications/${uuid}/logs`
  if (resourceType.startsWith("standalone-")) return `databases/${uuid}/logs`

  return null
}

const requestLogs = async (connection: ServerData, path: string): Promise<string> => {
  const separator = path.includes("?") ? "&" : "?"
  const response = await request<CoolifyLogs>(
    connection,
    `${path}${separator}lines=${RESOURCE_LOG_LINES}&show_timestamps=true`
  )

  if (typeof response.logs !== "string") throw Error("Coolify returned invalid log data")

  return response.logs
}

/** Converts request failures into short messages without leaking connection URLs. */
const resourceLogsErrorMessage = (error: unknown): string => {
  if (error instanceof FetchError) {
    if (typeof error.status === "number") {
      const label = HTTP_STATUS_LABELS[error.status]
      return `Error: ${error.status}${label ? ` ${label}` : ""}`
    }

    return error.message.toLowerCase().includes("timeout")
      ? "Error: Request Timeout"
      : "Error: Network Request Failed"
  }

  if (error instanceof Error) return `Error: ${error.message.replace(/^error:\s*/i, "")}`

  return "Error: Unable to Refresh Logs"
}

const serviceSubResourceNames = (service: CoolifyService): string[] => {
  const applications = readArray<CoolifyServiceSubResource>(
    service.applications ?? [],
    "service applications"
  )
  const databases = readArray<CoolifyServiceSubResource>(service.databases ?? [], "service databases")

  return [...new Set([...applications, ...databases].map(({ name }) => normalizedText(name)).filter(Boolean))]
}

/** Loads container-runtime logs while keeping service sub-resources as separate streams. */
const loadResourceLogs = async (
  connection: ServerData,
  resource: Pick<Resource, "uuid" | "name" | "type" | "logs" | "logsUpdatedAt">
): Promise<ResourceLogsSnapshot> => {
  const path = logsPath(resource.type, resource.uuid)
  if (path) {
    return {
      logs: [{ source: resource.name, content: await requestLogs(connection, path) }],
      logsUpdatedAt: Date.now(),
    }
  }

  if (resource.type !== "service") return { logs: resource.logs, logsUpdatedAt: resource.logsUpdatedAt }

  const uuid = encodeURIComponent(resource.uuid)
  const service = await request<CoolifyService>(connection, `services/${uuid}`)
  const names = serviceSubResourceNames(service)
  const previousLogs = new Map(resource.logs.map((log) => [log.source, log]))
  let receivedFreshLogs = false
  let firstError: unknown

  const logs = (
    await Promise.all(
      names.map(async (source): Promise<ResourceLog | null> => {
        try {
          const content = await requestLogs(
            connection,
            `services/${uuid}/logs?sub_service_name=${encodeURIComponent(source)}`
          )
          receivedFreshLogs = true
          return { source, content }
        } catch (error) {
          firstError ??= error
          return previousLogs.get(source) ?? null
        }
      })
    )
  ).filter((log): log is ResourceLog => log !== null)

  // Do not turn a failed request for every service container into a successful,
  // empty refresh. The consumer needs the failure in order to explain why no
  // logs are visible and retain the last successful update time.
  if (names.length > 0 && !receivedFreshLogs) {
    throw firstError instanceof Error ? firstError : Error("Unable to load service logs")
  }

  return {
    logs,
    logsUpdatedAt: Date.now(),
  }
}

const previousResourceProjects = (resources: Resource[]): Map<string, ResourceProject> => {
  const projects = new Map<string, ResourceProject>()

  for (const resource of resources) {
    if (!resource.projectId || !resource.projectUuid || !resource.projectName) continue

    projects.set(resource.uuid, {
      projectId: resource.projectId,
      projectUuid: resource.projectUuid,
      projectName: resource.projectName,
      environmentName: resource.environmentName ?? null,
    })
  }

  return projects
}

/** Joins Coolify's resource ownership data to its project and environment names. */
const loadResourceProjects = async (connection: ServerData): Promise<Map<string, ResourceProject>> => {
  const [projectResponse, resourceResponse] = await Promise.all([
    request<unknown>(connection, "projects"),
    request<unknown>(connection, "resources"),
  ])
  const coolifyProjects = readArray<CoolifyProject>(projectResponse, "projects")
  const coolifyResources = readArray<CoolifyResourceOwnership>(resourceResponse, "resources")

  const environmentResults = await Promise.all(
    coolifyProjects.map(async (project) => {
      const projectUuid = coolifyId(project, "project")
      const environmentResponse = await request<unknown>(
        connection,
        `projects/${encodeURIComponent(projectUuid)}/environments`
      )

      return {
        project: {
          projectId: scopedId(connection.id, "project", projectUuid),
          projectUuid,
          projectName: normalizedText(project.name, projectUuid),
        },
        environments: readArray<CoolifyEnvironment>(environmentResponse, "environments"),
      }
    })
  )

  const projectsByEnvironmentId = new Map<string, ResourceProject>()
  for (const { project, environments } of environmentResults) {
    for (const environment of environments) {
      const environmentId = normalizedText(environment.id)
      if (!environmentId) throw Error("Coolify returned an environment without an id")

      projectsByEnvironmentId.set(environmentId, {
        ...project,
        environmentName: normalizedText(environment.name, "Unknown environment"),
      })
    }
  }

  const projectsByResourceUuid = new Map<string, ResourceProject>()
  for (const resource of coolifyResources) {
    const resourceUuid = coolifyId(resource, "resource")
    const project = projectsByEnvironmentId.get(normalizedText(resource.environment_id))
    if (project) projectsByResourceUuid.set(resourceUuid, project)
  }

  return projectsByResourceUuid
}

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

  const resourceProjectsPromise = loadResourceProjects(connection).catch(() =>
    previousResourceProjects(previousResources)
  )

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
        const resourceProjects = await resourceProjectsPromise
        let hasMalformedResource = false
        const resourcesWithoutLogs = coolifyResources.flatMap<Resource>((coolifyResource) => {
          try {
            const resourceUuid = coolifyId(coolifyResource, "resource")
            const rawStatus = normalizedText(coolifyResource.status, "unknown")
            const project = resourceProjects.get(resourceUuid)
            const previousResource = previousResources.find(
              (resource) => resource.id === scopedId(connection.id, uuid, resourceUuid)
            )
            return [
              {
                id: scopedId(connection.id, uuid, resourceUuid),
                uuid: resourceUuid,
                connectionId: connection.id,
                instanceId,
                projectId: project?.projectId ?? null,
                projectUuid: project?.projectUuid ?? null,
                projectName: project?.projectName ?? null,
                environmentName: project?.environmentName ?? null,
                name: normalizedText(coolifyResource.name, resourceUuid),
                type: normalizedText(coolifyResource.type, "unknown").toLowerCase(),
                rawStatus,
                status: normalizeResourceStatus(rawStatus),
                isReachable: reportedReachable,
                logs: previousResource?.logs ?? [],
                logsUpdatedAt: previousResource?.logsUpdatedAt ?? null,
              },
            ]
          } catch {
            hasMalformedResource = true
            return []
          }
        })

        return { instance, resources: resourcesWithoutLogs, failed: hasMalformedResource }
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
const activeResourceLogSyncs = new Map<string, Promise<void>>()

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

/** Refreshes one resource's runtime logs without reloading the infrastructure snapshot. */
export const refreshCoolifyResourceLogs = async (resourceId: string): Promise<void> => {
  const activeLogSync = activeResourceLogSyncs.get(resourceId)
  if (activeLogSync) return activeLogSync

  const logSync = (async () => {
    const state = useDataStore.getState()
    const resource = state.resources.find((item) => item.id === resourceId)
    if (!resource) throw Error("Resource not found")

    const connection = state.servers.find((server) => server.id === resource.connectionId)
    if (!connection) throw Error("Coolify connection not found")

    const logs = await loadResourceLogs(connection, resource)
    useDataStore.getState().setResourceLogs(resourceId, logs)
  })()

  activeResourceLogSyncs.set(resourceId, logSync)

  try {
    await logSync
  } finally {
    if (activeResourceLogSyncs.get(resourceId) === logSync) activeResourceLogSyncs.delete(resourceId)
  }
}

export type CoolifyResourceLogsOptions = {
  /** Starts or pauses polling without unmounting the consumer. */
  enabled?: boolean
  /** Polling cadence. Defaults to two seconds. */
  refreshIntervalMs?: number
}

/**
 * Keeps one resource's runtime logs fresh while its consumer is mounted.
 *
 * Coolify exposes log-tail snapshots rather than a streaming API, so this hook
 * provides near-realtime updates by polling only the resource being viewed.
 */
export const useCoolifyResourceLogs = (
  resourceId: string | undefined,
  { enabled = true, refreshIntervalMs = RESOURCE_LOG_REFRESH_INTERVAL_MS }: CoolifyResourceLogsOptions = {}
) => {
  const resource = useDataStore((state) =>
    resourceId ? state.resources.find((item) => item.id === resourceId) : undefined
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshPromise = useRef<Promise<void> | null>(null)

  const refresh = useCallback(async () => {
    if (!resourceId) return
    if (refreshPromise.current) return refreshPromise.current

    setIsRefreshing(true)
    const nextRefresh = refreshCoolifyResourceLogs(resourceId)
      .then(() => setError(null))
      .catch((refreshError: unknown) => {
        setError(resourceLogsErrorMessage(refreshError))
      })
      .finally(() => {
        if (refreshPromise.current === nextRefresh) refreshPromise.current = null
        setIsRefreshing(false)
      })

    refreshPromise.current = nextRefresh
    return nextRefresh
  }, [resourceId])

  useEffect(() => {
    if (!enabled || !resourceId) return

    void refresh()
    const interval = setInterval(
      () => {
        if (AppState.currentState === "active") void refresh()
      },
      Math.max(1_000, refreshIntervalMs)
    )
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void refresh()
    })

    return () => {
      clearInterval(interval)
      appStateSubscription.remove()
    }
  }, [enabled, refresh, refreshIntervalMs, resourceId])

  return {
    logs: resource?.logs ?? [],
    logsUpdatedAt: resource?.logsUpdatedAt ?? null,
    isLoading: isRefreshing && resource?.logsUpdatedAt == null,
    isRefreshing,
    error,
    refresh,
  }
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
