import { useDataStore } from "@/lib/stores/data"
import { HealthStatus, type Instance, type Resource } from "@/lib/types/coolify"
import { ServerData } from "../servers/connection"
export { HealthStatus } from "@/lib/types/coolify"

export type OverviewData = {
  servers: ServerData[]
  failedServerCount: number
  resources: Resource[]
  instances: Instance[]
  healthStatus: HealthStatus
  healthIssues: HealthIssue[]
}

export type HealthIssue = {
  id: string
  kind: "connection" | "instance" | "resource" | "data"
  title: string
  description: string
  severity: HealthStatus.DEGRADED | HealthStatus.UNHEALTHY | HealthStatus.UNKNOWN
  target?: {
    type: "servers" | "instances" | "resources"
    id: string
  }
}

/**
 * derives the overall state from the latest resource reports
 *
 * unreachable infrastructure takes priority, and a missing or unknown report
 * cannot be classified safely, while a known resource failure degrades service
 */
export const calculateHealthStatus = (
  resources: Resource[],
  hasCurrentData: boolean,
  hasSyncFailures = false,
  instances: Instance[] = []
): HealthStatus => {
  if (!hasCurrentData) {
    return HealthStatus.UNKNOWN
  }

  if (hasSyncFailures || instances.some((instance) => !instance.isReachable)) {
    return HealthStatus.UNHEALTHY
  }

  if (resources.length === 0) return HealthStatus.UNKNOWN

  const hasIncompleteReport = resources.some((resource) => resource.status === "unknown")

  if (hasIncompleteReport) {
    return HealthStatus.UNKNOWN
  }

  const hasResourceFailure = resources.some(
    (resource) => !resource.isReachable || resource.status === "stopped" || resource.status === "failed"
  )

  return hasResourceFailure ? HealthStatus.DEGRADED : HealthStatus.HEALTHY
}

const resourceContext = (resource: Resource): string =>
  [resource.projectName, resource.environmentName].filter(Boolean).join(" · ")

/** Returns the concrete reports responsible for a non-healthy overview state. */
export const collectHealthIssues = (
  servers: ServerData[],
  resources: Resource[],
  instances: Instance[],
  hasCurrentData: boolean,
  failedServerIds: string[]
): HealthIssue[] => {
  if (!hasCurrentData) {
    return [
      {
        id: "waiting-for-sync",
        kind: "data",
        title: "Waiting for current data",
        description: "Cooler has not completed an infrastructure refresh yet.",
        severity: HealthStatus.UNKNOWN,
      },
    ]
  }

  const issues: HealthIssue[] = []
  for (const connectionId of failedServerIds) {
    const server = servers.find((item) => item.id === connectionId)
    issues.push({
      id: `connection:${connectionId}`,
      kind: "connection",
      title: server?.nickname ?? "Coolify connection",
      description: server
        ? `The latest refresh from ${server.endpoint} failed.`
        : "The latest refresh from this Coolify connection failed.",
      severity: HealthStatus.UNHEALTHY,
      target: server ? { type: "servers", id: server.id } : undefined,
    })
  }

  const unreachableInstanceIds = new Set<string>()
  for (const instance of instances) {
    if (instance.isReachable) continue
    unreachableInstanceIds.add(instance.id)
    issues.push({
      id: `instance:${instance.id}`,
      kind: "instance",
      title: instance.name,
      description: "Coolify reports this deployment server as unreachable.",
      severity: HealthStatus.UNHEALTHY,
      target: { type: "instances", id: instance.id },
    })
  }

  if (resources.length === 0) {
    issues.push({
      id: "no-resources",
      kind: "data",
      title: "No resources reported",
      description: "Cooler cannot determine resource health until Coolify reports at least one resource.",
      severity: HealthStatus.UNKNOWN,
    })
  }

  for (const resource of resources) {
    const context = resourceContext(resource)
    const contextPrefix = context ? `${context} · ` : ""

    if (resource.status === "unknown") {
      issues.push({
        id: `resource:${resource.id}:unknown`,
        kind: "resource",
        title: resource.name,
        description: `${contextPrefix}Coolify reported an unknown status (${resource.rawStatus}).`,
        severity: HealthStatus.UNKNOWN,
        target: { type: "resources", id: resource.id },
      })
    } else if (resource.status === "stopped" || resource.status === "failed") {
      issues.push({
        id: `resource:${resource.id}:${resource.status}`,
        kind: "resource",
        title: resource.name,
        description: `${contextPrefix}Reported ${resource.rawStatus}.`,
        severity: HealthStatus.DEGRADED,
        target: { type: "resources", id: resource.id },
      })
    } else if (!resource.isReachable && !unreachableInstanceIds.has(resource.instanceId)) {
      issues.push({
        id: `resource:${resource.id}:unreachable`,
        kind: "resource",
        title: resource.name,
        description: `${contextPrefix}The resource could not be reached.`,
        severity: HealthStatus.DEGRADED,
        target: { type: "resources", id: resource.id },
      })
    }
  }

  return issues
}

/** overview data hook backed by the persisted zustand data store */
export const useOverview = (): OverviewData => {
  const servers = useDataStore((state) => state.servers)
  const resources = useDataStore((state) => state.resources)
  const instances = useDataStore((state) => state.instances)
  const hasHydrated = useDataStore((state) => state.hasHydrated)
  const hasSynced = useDataStore((state) => state.hasSynced)
  const failedServerIds = useDataStore((state) => state.failedServerIds)
  const hasCurrentData = hasHydrated && hasSynced

  return {
    servers: servers,
    failedServerCount: failedServerIds.length,
    resources: resources,
    instances: instances,
    healthStatus: calculateHealthStatus(resources, hasCurrentData, failedServerIds.length > 0, instances),
    healthIssues: collectHealthIssues(servers, resources, instances, hasCurrentData, failedServerIds),
  }
}
