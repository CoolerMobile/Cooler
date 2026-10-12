import { useDataStore } from "@/lib/stores/data"
import { HealthStatus, type Instance, type Resource } from "@/lib/types/coolify"
import { ServerData } from "../servers/connection"
import { calculateIssueHealthStatus, collectHealthIssues, type HealthIssue } from "@/lib/coolify/health"
export { HealthStatus } from "@/lib/types/coolify"
export type { HealthIssue } from "@/lib/coolify/health"

export type OverviewData = {
  servers: ServerData[]
  failedServerCount: number
  resources: Resource[]
  instances: Instance[]
  healthStatus: HealthStatus
  healthIssues: HealthIssue[]
  dismissedHealthIssueCount: number
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

/** overview data hook backed by the persisted zustand data store */
export const useOverview = (): OverviewData => {
  const servers = useDataStore((state) => state.servers)
  const resources = useDataStore((state) => state.resources)
  const instances = useDataStore((state) => state.instances)
  const hasHydrated = useDataStore((state) => state.hasHydrated)
  const hasSynced = useDataStore((state) => state.hasSynced)
  const failedServerIds = useDataStore((state) => state.failedServerIds)
  const dismissedHealthIssueIds = useDataStore((state) => state.dismissedHealthIssueIds)
  const hasCurrentData = hasHydrated && hasSynced
  const healthIssues = collectHealthIssues(servers, resources, instances, hasCurrentData, failedServerIds)
  const dismissedIssues = new Set(dismissedHealthIssueIds)
  const visibleHealthIssues = healthIssues.filter((issue) => !dismissedIssues.has(issue.id))

  return {
    servers: servers,
    failedServerCount: failedServerIds.length,
    resources: resources,
    instances: instances,
    healthStatus: calculateIssueHealthStatus(visibleHealthIssues),
    healthIssues,
    dismissedHealthIssueCount: healthIssues.length - visibleHealthIssues.length,
  }
}
