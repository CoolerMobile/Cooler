/** A resource status reported by Coolify. */
export type ResourceStatus = "running" | "stopped" | "failed" | "unknown"

/**
 * A deployed resource whose reported state contributes to the overview health.
 */
export type Resource = {
  id: string
  uuid: string
  name: string
  type: string
  /** The saved Coolify connection this resource was discovered through. */
  connectionId: string
  instanceId: string
  /** The unmodified status returned by Coolify. */
  rawStatus: string
  /** Critical resources make the overall health unhealthy when unavailable. */
  isCritical: boolean
  /** Whether the resource can currently be reached by its instance. */
  isReachable: boolean
  status: ResourceStatus
}

/**
 * coolify instance
 */
export type Instance = {
  id: string
  uuid: string
  name: string
  description: string
  /** The saved Coolify connection that manages this deployment target. */
  connectionId: string
  isReachable: boolean
}

export enum HealthStatus {
  /** every reachable resource is running and healthy */
  HEALTHY = "Healthy",

  /** core services are healthy, but some resources need attention */
  DEGRADED = "Degraded",

  /** at least one critical resource is stopped, failing, or unreachable */
  UNHEALTHY = "Unhealthy",

  /** not enough information retrieved to decide on a proper status */
  UNKNOWN = "Unknown",
}
