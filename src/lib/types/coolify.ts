/** A resource status reported by Coolify. */
export type ResourceStatus = "running" | "stopped" | "failed" | "unknown"

/** A named container-runtime log stream returned by Coolify. */
export type ResourceLog = {
  /** The resource name, or the sub-resource name for a multi-container service. */
  source: string
  /** The raw log output returned by Coolify. */
  content: string
}

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
  /** The Coolify project and environment that own this resource. */
  projectId: string | null
  projectUuid: string | null
  projectName: string | null
  environmentName: string | null
  /** The unmodified status returned by Coolify. */
  rawStatus: string
  /** Whether the resource can currently be reached by its instance. */
  isReachable: boolean
  status: ResourceStatus
  /** Current container-runtime logs. Services expose one entry per sub-resource. */
  logs: ResourceLog[]
  /** The time the latest log request succeeded, or null when logs are unavailable. */
  logsUpdatedAt: number | null
}

export type ResourceLogsRouteParams = Pick<
  Resource,
  "id" | "uuid" | "name" | "type" | "connectionId" | "instanceId"
>

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

  /** infrastructure is reachable, but some resources need attention */
  DEGRADED = "Degraded",

  /** a Coolify connection or deployment target is unreachable */
  UNHEALTHY = "Unhealthy",

  /** not enough information retrieved to decide on a proper status */
  UNKNOWN = "Unknown",
}
