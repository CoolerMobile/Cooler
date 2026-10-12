import type { ServerData } from "@/lib/hooks/servers/connection"
import { HealthStatus, type Instance, type Resource } from "@/lib/types/coolify"

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
  const failedConnections = new Set(failedServerIds)

  for (const connectionId of failedConnections) {
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

    // A failed connection makes all of its cached instances unreachable. The
    // connection finding already explains that failure, so do not report the
    // same outage a second time as an instance finding.
    if (failedConnections.has(instance.connectionId)) continue

    issues.push({
      id: `instance:${instance.id}`,
      kind: "instance",
      title: instance.name,
      description: "Coolify reports this deployment server as unreachable.",
      severity: HealthStatus.UNHEALTHY,
      target: { type: "instances", id: instance.id },
    })
  }

  if (resources.length === 0 && failedConnections.size === 0) {
    issues.push({
      id: "no-resources",
      kind: "data",
      title: "No resources reported",
      description: "Cooler cannot determine resource health until Coolify reports at least one resource.",
      severity: HealthStatus.UNKNOWN,
    })
  }

  for (const resource of resources) {
    // Cached data from a connection that just failed is marked unreachable.
    // The connection finding is the actionable root cause in that case.
    if (failedConnections.has(resource.connectionId)) continue

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
