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
}

/**
 * derives the overall state from the latest resource reports
 *
 * critical failures take priority, and a missing or unknown report cannot be
 * classified safely, while a known non-critical failure degrades the service
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

  const hasCriticalFailure = resources.some(
    (resource) =>
      resource.isCritical &&
      (!resource.isReachable || resource.status === "stopped" || resource.status === "failed")
  )

  if (hasCriticalFailure) {
    return HealthStatus.UNHEALTHY
  }

  const hasIncompleteReport = resources.some((resource) => resource.status === "unknown")

  if (hasIncompleteReport) {
    return HealthStatus.UNKNOWN
  }

  const hasNonCriticalFailure = resources.some(
    (resource) =>
      !resource.isCritical &&
      (!resource.isReachable || resource.status === "stopped" || resource.status === "failed")
  )

  return hasNonCriticalFailure ? HealthStatus.DEGRADED : HealthStatus.HEALTHY
}

/** overview data hook backed by the persisted zustand data store */
export const useOverview = (): OverviewData => {
  const servers = useDataStore((state) => state.servers)
  const resources = useDataStore((state) => state.resources)
  const instances = useDataStore((state) => state.instances)
  const hasHydrated = useDataStore((state) => state.hasHydrated)
  const hasSynced = useDataStore((state) => state.hasSynced)
  const failedServerIds = useDataStore((state) => state.failedServerIds)

  return {
    servers: servers,
    failedServerCount: failedServerIds.length,
    resources: resources,
    instances: instances,
    healthStatus: calculateHealthStatus(
      resources,
      hasHydrated && hasSynced,
      failedServerIds.length > 0,
      instances
    ),
  }
}
