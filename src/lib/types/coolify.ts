/** A Coolify server persisted by the Zustand data store. */
export type Server = {
  id: string;
  name: string;
  description: string;
};

/** A resource status reported by Coolify. */
export type ResourceStatus = "running" | "stopped" | "failed" | "unknown";

/**
 * A deployed resource whose reported state contributes to the overview health.
 */
export type Resource = {
  id: string;
  name: string;
  instanceId: string;
  /** Critical resources make the overall health unhealthy when unavailable. */
  isCritical: boolean;
  /** Whether the resource can currently be reached by its instance. */
  isReachable: boolean;
  status: ResourceStatus;
};

/**
 * coolify instance
 */
export type Instance = {
  id: string;
  name: string;
  description: string;
};

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
