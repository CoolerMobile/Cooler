import type { ServerData } from "@/lib/hooks/servers/connection"
import { useDataStore } from "@/lib/stores/data"
import type { Resource, ResourceLog } from "@/lib/types/coolify"
import { FetchError, ofetch } from "ofetch"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"

const API_PREFIX = "api/v1"
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

type ResourceLogsSnapshot = Pick<Resource, "logs" | "logsUpdatedAt">

type ActiveResourceLogSync = {
  promise: Promise<void>
}

const activeResourceLogSyncs = new Map<string, ActiveResourceLogSync>()

const normalizedText = (value: unknown, fallback = ""): string =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() || fallback : fallback

const readArray = <T>(value: unknown, collectionName: string): T[] => {
  if (!Array.isArray(value)) throw Error(`Coolify returned invalid ${collectionName} data`)
  return value as T[]
}

const request = async <T>(server: ServerData, path: string): Promise<T> =>
  ofetch<T>(`${server.endpoint}/${API_PREFIX}/${path}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${server.token}`,
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
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

const serviceSubResourceNames = (service: CoolifyService): string[] => {
  const applications = readArray<CoolifyServiceSubResource>(
    service.applications ?? [],
    "service applications"
  )
  const databases = readArray<CoolifyServiceSubResource>(service.databases ?? [], "service databases")

  return [...new Set([...applications, ...databases].map(({ name }) => normalizedText(name)).filter(Boolean))]
}

/**
 * Fetches one discrete log snapshot.
 *
 * For services, container metadata is discovered once and exactly one container
 * log endpoint is queried per refresh. We deliberately never fan out across
 * every service container because each request ultimately reaches Docker.
 */
const loadResourceLogs = async (
  connection: ServerData,
  resource: Pick<Resource, "uuid" | "name" | "type" | "logs" | "logsUpdatedAt">,
  selectedSource?: string
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
  const previousLogs = new Map(resource.logs.map((log) => [log.source, log]))
  let names = resource.logs.map(({ source }) => source)

  if (names.length === 0) {
    const service = await request<CoolifyService>(connection, `services/${uuid}`)
    names = serviceSubResourceNames(service)
  }

  if (names.length === 0) return { logs: [], logsUpdatedAt: Date.now() }

  const source = selectedSource && names.includes(selectedSource) ? selectedSource : names[0]
  const content = await requestLogs(
    connection,
    `services/${uuid}/logs?sub_service_name=${encodeURIComponent(source)}`
  )

  const logs: ResourceLog[] = names.map((name) =>
    name === source ? { source: name, content } : (previousLogs.get(name) ?? { source: name, content: "" })
  )

  return {
    logs,
    logsUpdatedAt: Date.now(),
  }
}

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

const refreshCoolifyResourceLogs = async (resourceId: string, selectedSource?: string): Promise<void> => {
  const syncKey = `${resourceId}:${selectedSource ?? ""}`
  const activeLogSync = activeResourceLogSyncs.get(syncKey)
  if (activeLogSync) return activeLogSync.promise

  const logSync = (async () => {
    const state = useDataStore.getState()
    const resource = state.resources.find((item) => item.id === resourceId)
    if (!resource) throw Error("Resource not found")

    const connection = state.servers.find((server) => server.id === resource.connectionId)
    if (!connection) throw Error("Coolify connection not found")

    const logs = await loadResourceLogs(connection, resource, selectedSource)
    useDataStore.getState().setResourceLogs(resourceId, logs)
  })()

  const activeEntry = { promise: logSync }
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
  /** For services, polls only this container. */
  selectedSource?: string
  /** Delay after a successful request completes. Defaults to five seconds. */
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
 * Provides near-realtime logs using discrete, non-overlapping snapshots.
 *
 * A new request is scheduled only after the previous one has fully completed.
 * Losing screen focus or backgrounding the app stops future polls immediately,
 * but intentionally does not abort an in-flight request so Coolify/Docker can
 * finish tearing down the current log command cleanly.
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
  const refreshPromise = useRef<Promise<boolean> | null>(null)
  const selectedSourceRef = useRef(selectedSource)
  const previousSelectedSourceRef = useRef(selectedSource)

  selectedSourceRef.current = selectedSource

  const refresh = useCallback(
    async (source = selectedSourceRef.current): Promise<boolean> => {
      if (!resourceId) return false
      if (refreshPromise.current) return refreshPromise.current

      setIsRefreshing(true)
      let nextRefresh: Promise<boolean>
      nextRefresh = refreshCoolifyResourceLogs(resourceId, source)
        .then(() => {
          setError(null)
          return true
        })
        .catch((refreshError: unknown) => {
          setError(resourceLogsErrorMessage(refreshError))
          return false
        })
        .finally(() => {
          if (refreshPromise.current === nextRefresh) {
            refreshPromise.current = null
            setIsRefreshing(false)
          }
        })

      refreshPromise.current = nextRefresh
      return nextRefresh
    },
    [resourceId]
  )

  useEffect(() => {
    if (!enabled || !resourceId) return

    let cancelled = false
    let appIsActive = AppState.currentState === "active"
    let failureCount = 0
    let timeout: ReturnType<typeof setTimeout> | undefined

    const clearScheduledPoll = () => {
      if (timeout) clearTimeout(timeout)
      timeout = undefined
    }

    const poll = async () => {
      if (cancelled || !appIsActive) return

      const succeeded = await refresh()
      if (cancelled || !appIsActive) return

      failureCount = succeeded ? 0 : failureCount + 1
      timeout = setTimeout(poll, resourceLogRefreshDelay(failureCount, refreshIntervalMs))
    }

    void poll()

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      const wasActive = appIsActive
      appIsActive = nextState === "active"

      if (!appIsActive) {
        clearScheduledPoll()
      } else if (!wasActive) {
        failureCount = 0
        void poll()
      }
    })

    return () => {
      cancelled = true
      clearScheduledPoll()
      appStateSubscription.remove()
    }
  }, [enabled, refresh, refreshIntervalMs, resourceId])

  // Switching between already-discovered service containers should feel
  // immediate. Skip the initial undefined -> first-container selection because
  // the first snapshot already fetched that source.
  useEffect(() => {
    const previousSource = previousSelectedSourceRef.current
    previousSelectedSourceRef.current = selectedSource

    if (!enabled || !resourceId || !selectedSource || !previousSource || selectedSource === previousSource) return
    if (AppState.currentState !== "active") return

    void refresh(selectedSource)
  }, [enabled, refresh, resourceId, selectedSource])

  return {
    logs: resource?.logs ?? [],
    logsUpdatedAt: resource?.logsUpdatedAt ?? null,
    isLoading: isRefreshing && resource?.logsUpdatedAt == null,
    isRefreshing,
    error,
    refresh,
  }
}
