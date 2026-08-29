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
const RESOURCE_ACTION_REFRESH_DELAYS_MS = [750, 1_250, 2_000, 3_500, 5_500, 8_000] as const

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

export type CoolifyResourceAction = "start" | "restart" | "stop"

export type CoolifyResourceActionResult = {
  action: CoolifyResourceAction
  message: string
}

export type CoolifyResourceActionRefreshResult = {
  /** Whether Coolify reported the runtime state expected after the action. */
  settled: boolean
  /** Whether at least one fresh status response was stored. */
  refreshed: boolean
}

class CoolifyResourceActionError extends Error {}

class CoolifyRateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super("Coolify's API rate limit has been reached")
  }
}

const rateLimitBlockedUntil = new Map<string, number>()

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

const retryAfterMs = (headers: Headers, now = Date.now()): number | null => {
  const retryAfter = headers.get("retry-after")
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000

    const retryAt = Date.parse(retryAfter)
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - now)
  }

  const resetAtSeconds = Number(headers.get("x-ratelimit-reset"))
  return Number.isFinite(resetAtSeconds) && resetAtSeconds > 0
    ? Math.max(0, resetAtSeconds * 1_000 - now)
    : null
}

const updateRateLimit = (connectionId: string, response: Response) => {
  const remainingHeader = response.headers.get("x-ratelimit-remaining")
  const remaining = remainingHeader === null ? null : Number(remainingHeader)
  if (response.status !== 429 && (remaining === null || !Number.isFinite(remaining) || remaining > 0)) {
    return
  }

  // A self-hosted instance can customize its window. Prefer the headers it
  // reports and only fall back to Coolify's default one-minute window.
  const delay = retryAfterMs(response.headers) ?? 60_000
  const blockedUntil = Date.now() + delay
  rateLimitBlockedUntil.set(
    connectionId,
    Math.max(rateLimitBlockedUntil.get(connectionId) ?? 0, blockedUntil)
  )
}

const assertWithinRateLimit = (connectionId: string) => {
  const blockedUntil = rateLimitBlockedUntil.get(connectionId)
  if (!blockedUntil) return

  const remainingMs = blockedUntil - Date.now()
  if (remainingMs <= 0) {
    rateLimitBlockedUntil.delete(connectionId)
    return
  }

  throw new CoolifyRateLimitError(remainingMs)
}

const request = async <T>(
  server: ServerData,
  path: string,
  { method = "GET", signal }: { method?: "GET" | "POST"; signal?: AbortSignal } = {}
): Promise<T> => {
  assertWithinRateLimit(server.id)

  return ofetch<T>(`${server.endpoint}/${API_PREFIX}/${path}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${server.token}`,
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    method,
    onResponse: ({ response }) => updateRateLimit(server.id, response),
    retry: 0,
    signal,
    timeout: REQUEST_TIMEOUT_MS,
  })
}

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
    { signal }
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
    const service = await request<CoolifyService>(connection, `services/${uuid}`, { signal })
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

const resourceActionCollection = (resourceType: string): "applications" | "services" | "databases" | null => {
  if (resourceType === "application") return "applications"
  if (resourceType === "service") return "services"
  if (resourceType.startsWith("standalone-")) return "databases"

  return null
}

type ResourceLifecycleState = "running" | "stopped" | "unknown"

const resourceLifecycleState = (resource: Pick<Resource, "rawStatus" | "status">): ResourceLifecycleState => {
  const tokens = resource.rawStatus
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)

  // Prefer the runtime portion of compound statuses such as
  // `running:unhealthy` and `exited:unhealthy` over their health suffix.
  if (tokens.includes("running")) return "running"
  if (tokens.some((token) => ["stopped", "exited", "paused"].includes(token))) return "stopped"
  if (resource.status === "running" || resource.status === "failed") return "running"
  if (resource.status === "stopped") return "stopped"

  return "unknown"
}

/** Whether this resource type has a documented Coolify lifecycle endpoint. */
export const supportsCoolifyResourceActions = (resource: Pick<Resource, "type">): boolean =>
  resourceActionCollection(resource.type) !== null

/**
 * Checks the latest known runtime state before a lifecycle action is exposed
 * or sent. Unknown and unreachable resources are deliberately read-only.
 */
export const canRequestCoolifyResourceAction = (
  resource: Pick<Resource, "type" | "rawStatus" | "status" | "isReachable">,
  action: CoolifyResourceAction
): boolean => {
  if (!resource.isReachable || !resourceActionCollection(resource.type)) return false

  const lifecycle = resourceLifecycleState(resource)
  return action === "start" ? lifecycle === "stopped" : lifecycle === "running"
}

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
const activeResourceActions = new Map<string, Promise<CoolifyResourceActionResult>>()

/** Converts action failures into useful messages without exposing URLs or tokens. */
export const coolifyResourceActionErrorMessage = (error: unknown): string => {
  if (error instanceof CoolifyRateLimitError) {
    const seconds = Math.max(1, Math.ceil(error.retryAfterMs / 1_000))
    return `Coolify is rate limiting requests. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`
  }

  if (error instanceof CoolifyResourceActionError) return error.message

  if (error instanceof FetchError) {
    if (error.status === 400) return "Coolify rejected this action request."
    if (error.status === 401) return "The Coolify API token is no longer valid."
    if (error.status === 403) return "The Coolify API token does not have permission for this action."
    if (error.status === 404) return "Coolify could not find this resource."
    if (error.status === 408) return "The request to Coolify timed out."
    if (error.status === 409 || error.status === 422) {
      return "Coolify rejected the action because the resource state has changed."
    }
    if (error.status === 429) {
      const delay = error.response ? (retryAfterMs(error.response.headers) ?? 60_000) : 60_000
      const seconds = Math.max(1, Math.ceil(delay / 1_000))
      return `Coolify is rate limiting requests. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`
    }
    if (typeof error.status === "number" && error.status >= 500) {
      return "Coolify could not queue the action. Please try again later."
    }

    return error.message.toLowerCase().includes("timeout")
      ? "The request to Coolify timed out."
      : "Could not reach the Coolify API."
  }

  return "Coolify could not queue the action."
}

/**
 * Queues exactly one lifecycle mutation for a resource.
 *
 * POST requests are never retried: a lost response does not prove the write
 * failed, so retrying could enqueue the same operation twice.
 */
export const requestCoolifyResourceAction = (
  resourceId: string,
  action: CoolifyResourceAction
): Promise<CoolifyResourceActionResult> => {
  if (action !== "start" && action !== "restart" && action !== "stop") {
    return Promise.reject(new CoolifyResourceActionError("This resource action is not supported."))
  }

  const existingAction = activeResourceActions.get(resourceId)
  if (existingAction) return existingAction

  const actionRequest = (async () => {
    // Avoid racing an infrastructure refresh, then re-read the resource so a
    // menu built from a stale render cannot bypass the state guard below.
    if (activeSync) await activeSync

    const state = useDataStore.getState()
    const resource = state.resources.find((item) => item.id === resourceId)
    if (!resource) throw new CoolifyResourceActionError("This resource is no longer available.")
    if (!canRequestCoolifyResourceAction(resource, action)) {
      const verb = action === "start" ? "started" : action === "restart" ? "restarted" : "stopped"
      throw new CoolifyResourceActionError(`This resource cannot be ${verb} in its current state.`)
    }

    const collection = resourceActionCollection(resource.type)
    if (!collection) throw new CoolifyResourceActionError("This resource type does not support actions.")

    const connection = state.servers.find((server) => server.id === resource.connectionId)
    if (!connection) throw new CoolifyResourceActionError("The Coolify connection is no longer available.")

    await request<unknown>(connection, `${collection}/${encodeURIComponent(resource.uuid)}/${action}`, {
      method: "POST",
    })

    return {
      action,
      message: `${action.slice(0, 1).toUpperCase()}${action.slice(1)} request queued.`,
    }
  })()

  activeResourceActions.set(resourceId, actionRequest)
  const clearActiveAction = () => {
    if (activeResourceActions.get(resourceId) === actionRequest) activeResourceActions.delete(resourceId)
  }
  void actionRequest.then(clearActiveAction, clearActiveAction)

  return actionRequest
}

const waitForResourceActionRefresh = (delayMs: number, signal?: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false)
      return
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort)
      resolve(true)
    }, delayMs)
    const abort = () => {
      clearTimeout(timeout)
      resolve(false)
    }

    signal?.addEventListener("abort", abort, { once: true })
  })

/** Refreshes one resource from Coolify's compact per-server resource listing. */
const refreshCoolifyResourceStatus = async (resourceId: string, signal?: AbortSignal): Promise<Resource> => {
  const state = useDataStore.getState()
  const resource = state.resources.find((item) => item.id === resourceId)
  if (!resource) throw new CoolifyResourceActionError("This resource is no longer available.")

  const connection = state.servers.find((server) => server.id === resource.connectionId)
  const instance = state.instances.find((item) => item.id === resource.instanceId)
  if (!connection || !instance) {
    throw new CoolifyResourceActionError("The Coolify connection is no longer available.")
  }

  const response = await request<unknown>(
    connection,
    `servers/${encodeURIComponent(instance.uuid)}/resources`,
    { signal }
  )
  const resources = readArray<CoolifyResource>(response, "resources")
  const coolifyResource = resources.find((item) => {
    const uuid = normalizedText(item.uuid) || normalizedText(item.id)
    return uuid === resource.uuid
  })
  if (!coolifyResource) throw new CoolifyResourceActionError("Coolify no longer reports this resource.")

  const rawStatus = normalizedText(coolifyResource.status)
  if (!rawStatus) throw new CoolifyResourceActionError("Coolify returned this resource without a status.")

  const updatedResource = {
    ...resource,
    rawStatus,
    status: normalizeResourceStatus(rawStatus),
  }
  if (
    !signal?.aborted &&
    (updatedResource.rawStatus !== resource.rawStatus || updatedResource.status !== resource.status)
  ) {
    useDataStore.getState().setResourceStatus(resourceId, {
      rawStatus: updatedResource.rawStatus,
      status: updatedResource.status,
    })
  }

  return updatedResource
}

/**
 * Performs a small, bounded status poll after Coolify accepts an action.
 * Read failures and rate limits stop the poll; the regular monitor remains the fallback.
 */
export const refreshCoolifyResourceAfterAction = async (
  resourceId: string,
  action: CoolifyResourceAction,
  signal?: AbortSignal
): Promise<CoolifyResourceActionRefreshResult> => {
  const initialResource = useDataStore.getState().resources.find((item) => item.id === resourceId)
  if (!initialResource) return { settled: false, refreshed: false }

  let refreshed = false
  let sawRestartTransition = false

  for (const delayMs of RESOURCE_ACTION_REFRESH_DELAYS_MS) {
    if (!(await waitForResourceActionRefresh(delayMs, signal))) break

    let resource: Resource
    try {
      resource = await refreshCoolifyResourceStatus(resourceId, signal)
    } catch {
      // Do not repeatedly probe a connection that rejected or could not serve
      // the first refresh. The foreground monitor will make the next attempt.
      break
    }
    if (signal?.aborted) break

    refreshed = true
    const lifecycle = resourceLifecycleState(resource)
    if (action === "start" && lifecycle === "running") return { settled: true, refreshed }
    if (action === "stop" && lifecycle === "stopped") return { settled: true, refreshed }

    if (action === "restart") {
      if (lifecycle !== "running") sawRestartTransition = true
      if (
        lifecycle === "running" &&
        (sawRestartTransition || resource.rawStatus !== initialResource.rawStatus)
      ) {
        return { settled: true, refreshed }
      }
    }
  }

  return { settled: false, refreshed }
}

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
