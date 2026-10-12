import type { ServerData } from "@/lib/hooks/servers/connection"
import {
  resourceLogRequestGate,
  type ResourceLogRequestOutcome,
} from "@/lib/coolify/resource-log-request-gate"
import { useDataStore } from "@/lib/stores/data"
import type { Resource, ResourceLog } from "@/lib/types/coolify"
import { FetchError, ofetch } from "ofetch"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"

const API_PREFIX = "api/v1"
const REQUEST_TIMEOUT_MS = 15_000
// Coolify resolves runtime logs through the resource server over SSH. That can
// take considerably longer than its database-backed API endpoints.
export const RESOURCE_LOG_REQUEST_TIMEOUT_MS = 60_000
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

export type ResourceLogRequestTrace = {
  id: string
  label: string
  path: string
  startedAt: number
  finishedAt: number | null
  timeoutMs: number
  state: "pending" | "success" | "error"
  statusCode: number | null
  result: string | null
}

type ResourceLogRequestObserver = (trace: ResourceLogRequestTrace) => void

let resourceLogRequestSequence = 0

class ResourceLogRequestTimeoutError extends Error {
  constructor() {
    super("Runtime log request timed out")
    this.name = "ResourceLogRequestTimeoutError"
  }
}

class ResourceLogRequestCancelledError extends Error {
  constructor() {
    super("Runtime log request cancelled")
    this.name = "ResourceLogRequestCancelledError"
  }
}

const normalizedText = (value: unknown, fallback = ""): string =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() || fallback : fallback

const readArray = <T>(value: unknown, collectionName: string): T[] => {
  if (!Array.isArray(value)) throw Error(`Coolify returned invalid ${collectionName} data`)
  return value as T[]
}

const requestResult = (value: unknown): string => {
  if (value && typeof value === "object" && typeof (value as CoolifyLogs).logs === "string") {
    const logs = (value as { logs: string }).logs
    const lineCount = logs.length === 0 ? 0 : logs.split(/\r\n|\r|\n/).length
    return `${lineCount} ${lineCount === 1 ? "line" : "lines"} · ${logs.length.toLocaleString()} characters`
  }

  if (value && typeof value === "object") {
    const service = value as CoolifyService
    const subResourceCount =
      (Array.isArray(service.applications) ? service.applications.length : 0) +
      (Array.isArray(service.databases) ? service.databases.length : 0)
    if (subResourceCount > 0) {
      return `${subResourceCount} service ${subResourceCount === 1 ? "container" : "containers"} discovered`
    }
  }

  return "Response received"
}

const request = async <T>(
  server: ServerData,
  path: string,
  {
    timeout = REQUEST_TIMEOUT_MS,
    traceLabel,
    tracePath = path,
    onTrace,
    signal,
  }: {
    timeout?: number
    traceLabel?: string
    tracePath?: string
    onTrace?: ResourceLogRequestObserver
    signal?: AbortSignal
  } = {}
): Promise<T> => {
  const startedAt = Date.now()
  const id = `${startedAt}-${resourceLogRequestSequence++}`
  const baseTrace: ResourceLogRequestTrace = {
    id,
    label: traceLabel ?? "Fetch resource data",
    path: `/${API_PREFIX}/${tracePath}`,
    startedAt,
    finishedAt: null,
    timeoutMs: timeout,
    state: "pending",
    statusCode: null,
    result: null,
  }
  onTrace?.(baseTrace)

  const controller = new AbortController()
  let timedOut = false
  const cancelRequest = () => controller.abort()
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)

  if (signal?.aborted) cancelRequest()
  else signal?.addEventListener("abort", cancelRequest, { once: true })

  try {
    const response = await ofetch.raw<T>(`${server.endpoint}/${API_PREFIX}/${path}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${server.token}`,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      retry: 0,
      signal: controller.signal,
    })
    const data = response._data as T

    onTrace?.({
      ...baseTrace,
      finishedAt: Date.now(),
      state: "success",
      statusCode: response.status,
      result: requestResult(data),
    })
    return data
  } catch (error) {
    const cancelled = Boolean(signal?.aborted && !timedOut)
    const requestError = timedOut
      ? new ResourceLogRequestTimeoutError()
      : cancelled
        ? new ResourceLogRequestCancelledError()
        : error

    onTrace?.({
      ...baseTrace,
      finishedAt: Date.now(),
      state: "error",
      statusCode: error instanceof FetchError && typeof error.status === "number" ? error.status : null,
      result: cancelled
        ? "Cancelled when the log screen closed"
        : resourceLogsErrorMessage(requestError).replace(/^Error:\s*/i, ""),
    })
    throw requestError
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener("abort", cancelRequest)
  }
}

const logsPath = (resourceType: string, resourceUuid: string): string | null => {
  const uuid = encodeURIComponent(resourceUuid)

  if (resourceType === "application") return `applications/${uuid}/logs`
  if (resourceType.startsWith("standalone-")) return `databases/${uuid}/logs`

  return null
}

const requestLogs = async (
  connection: ServerData,
  path: string,
  label: string,
  onTrace?: ResourceLogRequestObserver,
  signal?: AbortSignal
): Promise<string> => {
  const separator = path.includes("?") ? "&" : "?"
  const query = `lines=${RESOURCE_LOG_LINES}&show_timestamps=true`
  const response = await request<CoolifyLogs>(connection, `${path}${separator}${query}`, {
    timeout: RESOURCE_LOG_REQUEST_TIMEOUT_MS,
    traceLabel: label,
    tracePath: `${path}${separator}${query}`,
    onTrace,
    signal,
  })

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
  selectedSource?: string,
  onTrace?: ResourceLogRequestObserver,
  signal?: AbortSignal
): Promise<ResourceLogsSnapshot> => {
  const path = logsPath(resource.type, resource.uuid)
  if (path) {
    const resourceKind = resource.type === "application" ? "application" : "database"
    return {
      logs: [
        {
          source: resource.name,
          content: await requestLogs(connection, path, `Fetch ${resourceKind} logs`, onTrace, signal),
        },
      ],
      logsUpdatedAt: Date.now(),
    }
  }

  if (resource.type !== "service") return { logs: resource.logs, logsUpdatedAt: resource.logsUpdatedAt }

  const uuid = encodeURIComponent(resource.uuid)
  const previousLogs = new Map(resource.logs.map((log) => [log.source, log]))
  let names = resource.logs.map(({ source }) => source)

  if (names.length === 0) {
    const service = await request<CoolifyService>(connection, `services/${uuid}`, {
      traceLabel: "Discover service containers",
      onTrace,
      signal,
    })
    names = serviceSubResourceNames(service)
  }

  if (names.length === 0) return { logs: [], logsUpdatedAt: Date.now() }

  const source = selectedSource && names.includes(selectedSource) ? selectedSource : names[0]
  const content = await requestLogs(
    connection,
    `services/${uuid}/logs?sub_service_name=${encodeURIComponent(source)}`,
    `Fetch ${source} logs`,
    onTrace,
    signal
  )

  const logs: ResourceLog[] = names.map((name) =>
    name === source ? { source: name, content } : (previousLogs.get(name) ?? { source: name, content: "" })
  )

  return {
    logs,
    logsUpdatedAt: Date.now(),
  }
}

const readApiErrorMessage = (value: unknown): string => {
  if (!value || typeof value !== "object") return ""
  const message = (value as { message?: unknown }).message
  return typeof message === "string" ? message.trim().replace(/\s+/g, " ").slice(0, 240) : ""
}

const resourceLogsErrorMessage = (error: unknown): string => {
  if (error instanceof ResourceLogRequestTimeoutError) return "Error: Runtime log request timed out"

  if (error instanceof FetchError) {
    if (error.status === 403) {
      return "Logs require a Coolify API token with Read Sensitive or Root permission."
    }

    if (typeof error.status === "number") {
      const label = HTTP_STATUS_LABELS[error.status]
      const apiMessage = readApiErrorMessage(error.data)
      return `Error: ${error.status}${label ? ` ${label}` : ""}${apiMessage ? ` — ${apiMessage}` : ""}`
    }

    const causeName = error.cause instanceof Error ? error.cause.name : ""
    const timedOut =
      error.message.toLowerCase().includes("timeout") ||
      causeName === "TimeoutError" ||
      causeName === "AbortError" ||
      Boolean(error.options?.timeout && error.options.signal?.aborted)

    return timedOut ? "Error: Runtime log request timed out" : "Error: Network Request Failed"
  }

  if (error instanceof Error) return `Error: ${error.message.replace(/^error:\s*/i, "")}`
  return "Error: Unable to Refresh Logs"
}

const refreshCoolifyResourceLogs = async (
  resourceId: string,
  selectedSource?: string,
  onTrace?: ResourceLogRequestObserver,
  signal?: AbortSignal
): Promise<void> => {
  const state = useDataStore.getState()
  const resource = state.resources.find((item) => item.id === resourceId)
  if (!resource) throw Error("Resource not found")

  const connection = state.servers.find((server) => server.id === resource.connectionId)
  if (!connection) throw Error("Coolify connection not found")

  const logs = await loadResourceLogs(connection, resource, selectedSource, onTrace, signal)
  if (signal?.aborted) throw new ResourceLogRequestCancelledError()
  useDataStore.getState().setResourceLogs(resourceId, logs)
}

export type CoolifyResourceLogsOptions = {
  /** Cancels an in-flight request when the consumer is no longer active. */
  enabled?: boolean
  /** For services, requests only this container. */
  selectedSource?: string
}

/**
 * Provides guarded, non-overlapping log snapshots.
 *
 * Runtime log requests make Coolify query Docker on the resource server, so this
 * hook loads once when the active screen opens, but never polls or retries.
 * Every request passes through a persisted, cross-screen gate.
 */
export const useCoolifyResourceLogs = (
  resourceId: string | undefined,
  { enabled = true, selectedSource }: CoolifyResourceLogsOptions = {}
) => {
  const resource = useDataStore((state) =>
    resourceId ? state.resources.find((item) => item.id === resourceId) : undefined
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requests, setRequests] = useState<ResourceLogRequestTrace[]>([])
  const [requestBlockedUntil, setRequestBlockedUntil] = useState<number | null>(null)
  const refreshPromise = useRef<Promise<boolean> | null>(null)
  const activeController = useRef<AbortController | null>(null)
  const selectedSourceRef = useRef(selectedSource)

  selectedSourceRef.current = selectedSource

  const observeRequest = useCallback((trace: ResourceLogRequestTrace) => {
    setRequests((current) => {
      const existingIndex = current.findIndex(({ id }) => id === trace.id)
      if (existingIndex === -1) return [...current, trace].slice(-20)

      const next = [...current]
      next[existingIndex] = trace
      return next
    })
  }, [])

  useEffect(() => {
    setRequests([])
    setError(null)
    setRequestBlockedUntil(null)
    if (!resourceId) return

    let cancelled = false
    void resourceLogRequestGate.getBlockedUntil(resourceId).then((blockedUntil) => {
      if (!cancelled) setRequestBlockedUntil(blockedUntil)
    })

    return () => {
      cancelled = true
    }
  }, [resourceId])

  const refresh = useCallback(
    async (source = selectedSourceRef.current): Promise<boolean> => {
      if (!resourceId) return false
      if (refreshPromise.current) return refreshPromise.current

      const acquisition = await resourceLogRequestGate.acquire(resourceId)
      if (!acquisition.acquired) {
        setRequestBlockedUntil(acquisition.blockedUntil)
        return false
      }

      const { lease } = acquisition
      setRequestBlockedUntil(lease.blockedUntil)
      const controller = new AbortController()
      activeController.current = controller
      setError(null)
      setIsRefreshing(true)
      let outcome: ResourceLogRequestOutcome = "uncertain"
      let nextRefresh: Promise<boolean>
      nextRefresh = refreshCoolifyResourceLogs(resourceId, source, observeRequest, controller.signal)
        .then(() => {
          outcome = "success"
          setError(null)
          return true
        })
        .catch((refreshError: unknown) => {
          if (refreshError instanceof ResourceLogRequestCancelledError) return false
          if (refreshError instanceof FetchError && typeof refreshError.status === "number") {
            outcome = "http-error"
          }
          setError(resourceLogsErrorMessage(refreshError))
          return false
        })
        .finally(async () => {
          const blockedUntil = await lease.complete(outcome)
          setRequestBlockedUntil(blockedUntil)
          if (refreshPromise.current === nextRefresh) {
            refreshPromise.current = null
            activeController.current = null
            setIsRefreshing(false)
          }
        })

      refreshPromise.current = nextRefresh
      return nextRefresh
    },
    [observeRequest, resourceId]
  )

  useEffect(() => {
    if (!enabled || !resourceId) {
      activeController.current?.abort()
      return
    }

    // Defer the initial request so React's development-only effect cleanup can
    // cancel the timer without starting and immediately aborting a real request.
    const initialRequest = setTimeout(() => {
      if (AppState.currentState === "active") void refresh()
    }, 0)

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") activeController.current?.abort()
    })

    return () => {
      clearTimeout(initialRequest)
      activeController.current?.abort()
      appStateSubscription.remove()
    }
  }, [enabled, refresh, resourceId])

  return {
    logs: resource?.logs ?? [],
    logsUpdatedAt: resource?.logsUpdatedAt ?? null,
    isLoading: isRefreshing && resource?.logsUpdatedAt == null,
    isRefreshing,
    error,
    requests,
    requestBlockedUntil,
    refresh,
  }
}
