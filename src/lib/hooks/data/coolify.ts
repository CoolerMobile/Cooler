import type { ServerData } from "@/lib/hooks/servers/connection"
import { normalizeResourceStatus } from "@/lib/coolify/status"
import { useDataStore } from "@/lib/stores/data"
import type { Instance, Resource, ResourceLog } from "@/lib/types/coolify"
import { FetchError, ofetch } from "ofetch"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"

const API_PREFIX = "api/v1"
const REFRESH_INTERVAL_MS = 60_000
const RESOURCE_LOG_REFRESH_INTERVAL_MS = 5_000
const REQUEST_TIMEOUT_MS = 15_000
const RESOURCE_LOG_LINES = 100
const RESOURCE_LOG_FAILURE_DELAYS_MS = [10_000, 20_000, 30_000] as const
const RESOURCE_LOG_MAX_FAILURE_DELAY_MS = 60_000
const RESOURCE_LOG_JITTER_RATIO = 0.1

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

const request = async <T>(server: ServerData, path: string, signal?: AbortSignal): Promise<T> =>
  ofetch<T>(`${server.endpoint}/${API_PREFIX}/${path}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${server.token}`,
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    retry: 0,
    signal,
    timeout: REQUEST_TIMEOUT_MS,
  })

const logsPath = (resourceType: string, resourceUuid: string): string | null => {
  const uuid = encodeURIComponent(resourceUuid)

  if (resourceType === "application") return `applications/${uuid}/logs`
  if (resourceType.startsWith("standalone-")) return `databases/${uuid}/logs`

  return null
}

const requestLogs = async (connection: ServerData, path: string, signal?: AbortSignal): Promise<string> => {
  const separator = path.includes("?") ? "&" : "?"
  const response = await request<CoolifyLogs>(
    connection,
    `${path}${separator}lines=${RESOURCE_LOG_LINES}&show_timestamps=true&_=${Date.now()}`,
    signal
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
  resource: Pick<Resource, "uuid" | "name" | "type" | "logs" | "logsUpdatedAt">,
  selectedSource?: string,
  signal?: AbortSignal
): Promise<ResourceLogsSnapshot> => {
  const path = logsPath(resource.type, resource.uuid)
  if (path) {
    return {
      logs: [{ source: resource.name, content: await requestLogs(connection, path, signal) }],
      logsUpdatedAt: Date.now(),
    }
  }

  if (resource.type !== "service") return { logs: resource.logs, logsUpdatedAt: resource.logsUpdatedAt }

  const uuid = encodeURIComponent(resource.uuid)
  const previousLogs = new Map(resource.logs.map((log) => [log.source, log]))
  let names = resource.logs.map(({ source }) => source)

  // Discover a service's containers once. Once the viewer has a selected
  // source, steady-state refreshes go directly to that container's log route.
  if (names.length === 0) {
    const service = await request<CoolifyService>(connection, `services/${uuid}`, signal)
    names = serviceSubResourceNames(service)
  }

  if (names.length === 0) return { logs: [], logsUpdatedAt: Date.now() }

  // Populate every selector the first time the service is opened. Subsequent
  // polls only refresh the selected stream, which keeps the live tail cheap
  // without presenting the other containers as permanently empty.
  const sources = selectedSource && names.includes(selectedSource) ? [selectedSource] : names
  let firstError: unknown
  let receivedFreshLogs = false
  const freshLogs = new Map<string, ResourceLog>()

  await Promise.all(
    sources.map(async (source) => {
      try {
        const content = await requestLogs(
          connection,
          `services/${uuid}/logs?sub_service_name=${encodeURIComponent(source)}`,
          signal
        )
        receivedFreshLogs = true
        freshLogs.set(source, { source, content })
      } catch (error) {
        firstError ??= error
      }
    })
  )

  if (!receivedFreshLogs) {
    throw firstError instanceof Error ? firstError : Error("Unable to load service logs")
  }

  const logs: ResourceLog[] = names.map(
    (name) => freshLogs.get(name) ?? previousLogs.get(name) ?? { source: name, content: "" }
  )

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
type ActiveResourceLogSync = { promise: Promise<void>; signal?: AbortSignal }
const activeResourceLogSyncs = new Map<string, ActiveResourceLogSync>()

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
export const refreshCoolifyResourceLogs = async (
  resourceId: string,
  selectedSource?: string,
  signal?: AbortSignal
): Promise<void> => {
  const syncKey = `${resourceId}:${selectedSource ?? ""}`
  const activeLogSync = activeResourceLogSyncs.get(syncKey)
  if (activeLogSync && !activeLogSync.signal?.aborted) return activeLogSync.promise

  const logSync = (async () => {
    const state = useDataStore.getState()
    const resource = state.resources.find((item) => item.id === resourceId)
    if (!resource) throw Error("Resource not found")

    const connection = state.servers.find((server) => server.id === resource.connectionId)
    if (!connection) throw Error("Coolify connection not found")

    const logs = await loadResourceLogs(connection, resource, selectedSource, signal)
    if (signal?.aborted) return
    useDataStore.getState().setResourceLogs(resourceId, logs)
  })()
  const activeEntry = { promise: logSync, signal }

  activeResourceLogSyncs.set(syncKey, activeEntry)

  try {
    await logSync
  } finally {
    if (activeResourceLogSyncs.get(syncKey) === activeEntry) activeResourceLogSyncs.delete(syncKey)
  }
}

export type CoolifyResourceLogsOptions = {
  /** Starts or pauses polling without unmounting the consumer. */
  enabled?: boolean
  /** For services, polls only this container after the initial container discovery. */
  selectedSource?: string
  /** Successful polling cadence. Defaults to five seconds. */
  refreshIntervalMs?: number
}

const resourceLogRefreshDelay = (failureCount: number, refreshIntervalMs: number): number => {
  const baseDelay =
    failureCount === 0
      ? Math.max(1_000, refreshIntervalMs)
      : (RESOURCE_LOG_FAILURE_DELAYS_MS[failureCount - 1] ?? RESOURCE_LOG_MAX_FAILURE_DELAY_MS)
  const jitter = 1 + (Math.random() * 2 - 1) * RESOURCE_LOG_JITTER_RATIO

  return Math.round(baseDelay * jitter)
}

/**
 * Keeps one resource's runtime logs fresh while its consumer is mounted.
 *
 * Coolify exposes log-tail snapshots rather than a streaming API, so this hook
 * provides near-realtime updates by polling only the resource being viewed.
 */
export const useCoolifyResourceLogs = (
  resourceId: string | undefined,
  {
    enabled = true,
    selectedSource,
    refreshIntervalMs = RESOURCE_LOG_REFRESH_INTERVAL_MS,
  }: CoolifyResourceLogsOptions = {}
) => {
  const resource = useDataStore((state) =>
    resourceId ? state.resources.find((item) => item.id === resourceId) : undefined
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshPromise = useRef<{
    key: string
    promise: Promise<boolean | null>
    signal?: AbortSignal
  } | null>(null)

  const refresh = useCallback(
    async (signal?: AbortSignal): Promise<boolean | null> => {
      if (!resourceId) return null
      const refreshKey = `${resourceId}:${selectedSource ?? ""}`
      if (refreshPromise.current?.key === refreshKey && !refreshPromise.current.signal?.aborted) {
        return refreshPromise.current.promise
      }

      setIsRefreshing(true)
      let nextRefresh: Promise<boolean | null>
      nextRefresh = refreshCoolifyResourceLogs(resourceId, selectedSource, signal)
        .then(() => {
          if (signal?.aborted) return null
          setError(null)
          return true
        })
        .catch((refreshError: unknown): boolean | null => {
          if (signal?.aborted) return null
          setError(resourceLogsErrorMessage(refreshError))
          return false
        })
        .finally(() => {
          if (refreshPromise.current?.promise === nextRefresh) {
            refreshPromise.current = null
            setIsRefreshing(false)
          }
        })

      refreshPromise.current = { key: refreshKey, promise: nextRefresh, signal }
      return nextRefresh
    },
    [resourceId, selectedSource]
  )

  useEffect(() => {
    if (!enabled || !resourceId) return

    let cancelled = false
    let appIsActive = AppState.currentState === "active"
    let failureCount = 0
    let timeout: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined

    const stopCurrentPoll = () => {
      if (timeout) clearTimeout(timeout)
      timeout = undefined
      controller?.abort()
      controller = undefined
    }

    const poll = async () => {
      if (cancelled || !appIsActive) return

      controller = new AbortController()
      const succeeded = await refresh(controller.signal)
      controller = undefined

      if (cancelled || !appIsActive || succeeded === null) return

      failureCount = succeeded ? 0 : failureCount + 1
      timeout = setTimeout(poll, resourceLogRefreshDelay(failureCount, refreshIntervalMs))
    }

    if (appIsActive) void poll()
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      const wasActive = appIsActive
      appIsActive = nextState === "active"

      if (!appIsActive) {
        stopCurrentPoll()
      } else if (!wasActive) {
        void poll()
      }
    })

    return () => {
      cancelled = true
      stopCurrentPoll()
      appStateSubscription.remove()
    }
  }, [enabled, refresh, refreshIntervalMs, resourceId, selectedSource])

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
