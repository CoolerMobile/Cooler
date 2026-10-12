import type { ServerData } from "@/lib/hooks/servers/connection"
import { createLocalNotification } from "@/lib/hooks/notifications"
import { useDataStore } from "@/lib/stores/data"
import { useDeploymentStore } from "@/lib/stores/deployments"
import type { Deployment, DeploymentStatus, DeploymentTrigger } from "@/lib/types/deployment"
import type { Resource } from "@/lib/types/coolify"
import { FetchError, ofetch } from "ofetch"
import { useCallback, useEffect } from "react"
import { AppState } from "react-native"

const API_PREFIX = "api/v1"
const REQUEST_TIMEOUT_MS = 15_000
const ACTIVE_REFRESH_INTERVAL_MS = 7_500
const HISTORY_TAKE = 20

type CoolifyDeployment = {
  id?: unknown
  application_id?: unknown
  application_uuid?: unknown
  deployment_uuid?: unknown
  force_rebuild?: unknown
  commit?: unknown
  status?: unknown
  is_webhook?: unknown
  is_api?: unknown
  created_at?: unknown
  updated_at?: unknown
  logs?: unknown
  application_name?: unknown
  server_name?: unknown
  rollback?: unknown
  commit_message?: unknown
}

type DeploymentHistoryResponse = { deployments?: unknown } | CoolifyDeployment[]

const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : ""

const timestamp = (value: unknown, fallback = Date.now()): number => {
  const parsed = Date.parse(text(value))
  return Number.isNaN(parsed) ? fallback : parsed
}

const status = (value: unknown): DeploymentStatus => {
  const normalized = text(value).toLowerCase().replaceAll("-", "_")
  if (["finished", "success", "successful", "completed"].includes(normalized)) return "success"
  if (["failed", "error"].includes(normalized)) return "failed"
  if (normalized.includes("cancel")) return "cancelled"
  if (normalized === "queued" || normalized === "pending") return "queued"
  return "running"
}

const trigger = (raw: CoolifyDeployment): DeploymentTrigger => {
  if (raw.rollback === true) return "rollback"
  if (raw.is_webhook === true) return "webhook"
  if (raw.is_api === true) return "api"
  return "manual"
}

const deploymentLogs = (value: unknown, depth = 0): string => {
  if (typeof value === "string") {
    const trimmed = value.trim()

    // Coolify versions have returned this field both as plain text and as a
    // JSON-encoded log array/string. Decode the envelope before normalizing
    // escaped line endings so the viewer receives actual lines.
    if (depth < 2 && (/^[\[{\"]/.test(trimmed) || trimmed === "null")) {
      try {
        const decoded: unknown = JSON.parse(trimmed)
        if (decoded !== value) return deploymentLogs(decoded, depth + 1)
      } catch {
        // It is regular log output that happens to begin with JSON syntax.
      }
    }

    return (
      value
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n")
        .replace(/\r\n?/g, "\n")
        // Deployment output is terminal text. Remove ANSI/OSC sequences and
        // non-printing controls that otherwise create apparently blank rows in
        // React Native's text layout.
        .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
        .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001a\u001c-\u001f\u007f]/g, "")
    )
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return deploymentLogs(entry, depth + 1)
        if (!entry || typeof entry !== "object") return ""
        const item = entry as Record<string, unknown>
        return [text(item.timestamp), deploymentLogs(item.message ?? item.output ?? item.command, depth + 1)]
          .filter(Boolean)
          .join("  ")
      })
      .filter(Boolean)
      .join("\n")
  }
  return ""
}

const normalizeDeployment = (
  raw: CoolifyDeployment,
  server: ServerData,
  resource?: Resource
): Deployment | null => {
  const uuid = text(raw.deployment_uuid) || text(raw.id)
  if (!uuid) return null

  const createdAt = timestamp(raw.created_at)
  const updatedAt = timestamp(raw.updated_at, createdAt)
  const rawApplicationId = text(raw.application_uuid) || text(raw.application_id)

  return {
    id: `${server.id}:${uuid}`,
    uuid,
    connectionId: server.id,
    resourceUuid: resource?.uuid ?? (rawApplicationId || null),
    resourceName: text(raw.application_name) || resource?.name || "Unknown application",
    projectName: resource?.projectName ?? null,
    environmentName: resource?.environmentName ?? null,
    serverName: text(raw.server_name) || server.nickname,
    status: status(raw.status),
    commit: text(raw.commit) || null,
    commitMessage: text(raw.commit_message) || null,
    trigger: trigger(raw),
    createdAt,
    updatedAt,
    logs: deploymentLogs(raw.logs),
    logsAvailable: Object.prototype.hasOwnProperty.call(raw, "logs"),
    isRollback: raw.rollback === true,
  }
}

const deploymentRequest = async <T>(
  server: ServerData,
  path: string,
  options: { method?: "GET" | "POST" | "PATCH"; body?: Record<string, unknown> } = {}
): Promise<T> =>
  ofetch<T>(`${server.endpoint}/${API_PREFIX}/${path}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${server.token}`,
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    method: options.method ?? "GET",
    body: options.body,
    retry: 0,
    timeout: REQUEST_TIMEOUT_MS,
  })

const asDeploymentArray = (value: unknown): CoolifyDeployment[] => {
  if (Array.isArray(value)) return value as CoolifyDeployment[]
  if (value && typeof value === "object" && Array.isArray((value as { deployments?: unknown }).deployments)) {
    return (value as { deployments: CoolifyDeployment[] }).deployments
  }
  return []
}

const resourceForActiveDeployment = (raw: CoolifyDeployment, resources: Resource[]): Resource | undefined => {
  const applicationId = text(raw.application_uuid) || text(raw.application_id)
  const applicationName = text(raw.application_name)
  return resources.find(
    (resource) =>
      resource.uuid === applicationId ||
      resource.id === applicationId ||
      (applicationName.length > 0 && resource.name === applicationName)
  )
}

const loadServerDeployments = async (server: ServerData, resources: Resource[]): Promise<Deployment[]> => {
  const connectionResources = resources.filter(
    (resource) => resource.connectionId === server.id && resource.type === "application"
  )

  const [activeResponse, ...historyResponses] = await Promise.all([
    deploymentRequest<unknown>(server, "deployments"),
    ...connectionResources.map((resource) =>
      deploymentRequest<DeploymentHistoryResponse>(
        server,
        `deployments/applications/${encodeURIComponent(resource.uuid)}?skip=0&take=${HISTORY_TAKE}`
      ).catch(() => ({ deployments: [] }))
    ),
  ])

  const active = asDeploymentArray(activeResponse)
    .map((item) => normalizeDeployment(item, server, resourceForActiveDeployment(item, connectionResources)))
    .filter((item): item is Deployment => item !== null)

  const history = historyResponses.flatMap((response, index) =>
    asDeploymentArray(response)
      .map((item) => normalizeDeployment(item, server, connectionResources[index]))
      .filter((item): item is Deployment => item !== null)
  )

  const deployments = new Map(history.map((item) => [item.id, item]))
  for (const deployment of active) deployments.set(deployment.id, deployment)
  return [...deployments.values()]
}

const loadWatchedDeployment = async (deploymentId: string): Promise<Deployment> => {
  const separatorIndex = deploymentId.indexOf(":")
  if (separatorIndex < 1 || separatorIndex === deploymentId.length - 1) {
    throw Error(`Invalid watched deployment id: ${deploymentId}`)
  }

  const connectionId = deploymentId.slice(0, separatorIndex)
  const deploymentUuid = deploymentId.slice(separatorIndex + 1)
  const { servers, resources } = useDataStore.getState()
  const server = servers.find((item) => item.id === connectionId)
  if (!server) throw Error(`Missing Coolify connection for deployment ${deploymentUuid}`)

  const raw = await deploymentRequest<CoolifyDeployment>(
    server,
    `deployments/${encodeURIComponent(deploymentUuid)}`
  )
  const deployment = normalizeDeployment(
    raw,
    server,
    resourceForActiveDeployment(
      raw,
      resources.filter((resource) => resource.connectionId === connectionId)
    )
  )

  if (!deployment) throw Error(`Coolify returned an invalid deployment for ${deploymentUuid}`)
  return deployment
}

let refreshPromise: Promise<void> | null = null

export const refreshDeployments = async ({ showRefreshIndicator = false } = {}): Promise<void> => {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const deploymentStore = useDeploymentStore.getState()
    const { servers, resources } = useDataStore.getState()
    deploymentStore.setRequestState({
      isLoading: deploymentStore.updatedAt === null,
      isRefreshing: showRefreshIndicator && deploymentStore.updatedAt !== null,
      error: null,
    })

    if (servers.length === 0) {
      deploymentStore.setDeployments([])
      deploymentStore.setRequestState({ isLoading: false, isRefreshing: false })
      return
    }

    const results = await Promise.allSettled(
      servers.map((server) =>
        loadServerDeployments(
          server,
          resources.filter((resource) => resource.connectionId === server.id)
        )
      )
    )
    const activeServerIds = new Set(useDataStore.getState().servers.map((server) => server.id))
    const activeResults = results.filter((_, index) => activeServerIds.has(servers[index].id))
    const deployments = activeResults.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    const failedCount = activeResults.filter((result) => result.status === "rejected").length

    deploymentStore.setDeployments(deployments.sort((a, b) => b.createdAt - a.createdAt))
    deploymentStore.setRequestState({
      isLoading: false,
      isRefreshing: false,
      error:
        activeResults.length > 0 && failedCount === activeResults.length
          ? "Deployments could not be refreshed. Pull down to try again."
          : failedCount > 0
            ? `${failedCount} Coolify connection${failedCount === 1 ? "" : "s"} could not be refreshed.`
            : null,
    })
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

const serverForDeployment = (deployment: Deployment): ServerData => {
  const server = useDataStore.getState().servers.find((item) => item.id === deployment.connectionId)
  if (!server) throw Error("The Coolify connection is no longer available.")
  return server
}

export const cancelDeployment = async (deployment: Deployment): Promise<void> => {
  const server = serverForDeployment(deployment)
  await deploymentRequest(server, `deployments/${encodeURIComponent(deployment.uuid)}/cancel`, {
    method: "POST",
  })
  useDeploymentStore.getState().updateDeployment(deployment.id, {
    status: "cancelled",
    updatedAt: Date.now(),
  })
  void refreshDeployments()
}

export const redeployDeployment = async (deployment: Deployment): Promise<void> => {
  if (!deployment.resourceUuid) throw Error("This deployment is not linked to an application.")
  const server = serverForDeployment(deployment)
  await deploymentRequest(server, "deploy", {
    method: "POST",
    body: { uuid: deployment.resourceUuid },
  })
  void refreshDeployments()
}

export const rollbackDeployment = async (deployment: Deployment): Promise<void> => {
  if (!deployment.resourceUuid || !deployment.commit) {
    throw Error("This deployment does not include the application and commit needed for rollback.")
  }
  const server = serverForDeployment(deployment)
  await deploymentRequest(server, `applications/${encodeURIComponent(deployment.resourceUuid)}`, {
    method: "PATCH",
    body: { git_commit_sha: deployment.commit },
  })
  await deploymentRequest(server, "deploy", {
    method: "POST",
    body: { uuid: deployment.resourceUuid, force: true },
  })
  void refreshDeployments()
}

export const deploymentErrorMessage = (error: unknown): string => {
  if (error instanceof FetchError) {
    if (error.status === 401) return "The Coolify API token is no longer valid."
    if (error.status === 403) return "The API token does not have permission for this action."
    if (error.status === 404) return "Coolify could not find this deployment."
    if (error.status === 409) return "The deployment state changed before the action could run."
    if (typeof error.status === "number") return `Coolify rejected the request (${error.status}).`
    return "Could not reach the Coolify API."
  }
  return error instanceof Error ? error.message : "The deployment action could not be completed."
}

let refreshAndNotifyPromise: Promise<number> | null = null

/** Refreshes deployments and delivers locally generated completion notifications. */
export const refreshDeploymentsAndNotify = async (): Promise<number> => {
  if (refreshAndNotifyPromise) return refreshAndNotifyPromise

  refreshAndNotifyPromise = (async () => {
    await refreshDeployments()
    const state = useDeploymentStore.getState()
    const watchedResults = await Promise.allSettled(state.watchedDeploymentIds.map(loadWatchedDeployment))
    const deploymentsById = new Map(state.deployments.map((deployment) => [deployment.id, deployment]))

    for (const result of watchedResults) {
      if (result.status === "fulfilled") deploymentsById.set(result.value.id, result.value)
      else console.error("[deployments] watched deployment refresh failed:", result.reason)
    }

    const activeServerIds = new Set(useDataStore.getState().servers.map((server) => server.id))
    state.setDeployments(
      [...deploymentsById.values()]
        .filter((deployment) => activeServerIds.has(deployment.connectionId))
        .sort((a, b) => b.createdAt - a.createdAt)
    )
    let notificationCount = 0

    for (const deployment of deploymentsById.values()) {
      const isFinished = ["success", "failed", "cancelled"].includes(deployment.status)
      const currentWatches = useDeploymentStore.getState().watchedDeploymentIds
      const serverStillExists = useDataStore
        .getState()
        .servers.some((server) => server.id === deployment.connectionId)
      if (!isFinished || !serverStillExists || !currentWatches.includes(deployment.id)) continue

      try {
        await createLocalNotification({
          title: `${deployment.resourceName} ${deployment.status === "success" ? "deployed" : deployment.status}`,
          body:
            deployment.status === "success"
              ? "The deployment finished successfully."
              : `The deployment finished with status: ${deployment.status}.`,
          data: { deploymentId: deployment.id, deploymentUuid: deployment.uuid },
          channelId: "deployments",
        })
        state.unwatchDeployment(deployment.id)
        notificationCount += 1
      } catch (error) {
        // Keep watching so a later foreground or background pass can retry.
        console.error("[deployments] local notification delivery failed:", error)
        state.setRequestState({
          error: "The deployment finished, but its notification could not be delivered. Cooler will retry.",
        })
      }
    }

    return notificationCount
  })().finally(() => {
    refreshAndNotifyPromise = null
  })

  return refreshAndNotifyPromise
}

/** Polls while the app is active and delivers requested completion notifications. */
export const useDeploymentMonitor = () => {
  const refreshAndNotify = useCallback(refreshDeploymentsAndNotify, [])

  useEffect(() => {
    void refreshAndNotify()
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void refreshAndNotify()
    }, ACTIVE_REFRESH_INTERVAL_MS)
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void refreshAndNotify()
    })
    return () => {
      clearInterval(interval)
      subscription.remove()
    }
  }, [refreshAndNotify])
}
