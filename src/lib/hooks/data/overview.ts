import { useDataStore } from "@/lib/stores/data";
import { HealthStatus, type Resource } from "@/lib/types/coolify";
export { HealthStatus } from "@/lib/types/coolify";
import { useCallback } from "react";

export type OverviewData = {
  serverCount: number;
  resourceCount: number;
  instanceCount: number;
  healthStatus: HealthStatus;
};

/**
 * derives the overall state from the latest resource reports
 *
 * critical failures take priority, and a missing or unknown report cannot be
 * classified safely, while a known non-critical failure degrades the service
 */
export const calculateHealthStatus = (
  resources: Resource[],
  hasHydrated: boolean,
): HealthStatus => {
  if (!hasHydrated || resources.length === 0) {
    return HealthStatus.UNKNOWN;
  }

  const hasCriticalFailure = resources.some(
    (resource) =>
      resource.isCritical &&
      (!resource.isReachable ||
        resource.status === "stopped" ||
        resource.status === "failed"),
  );

  if (hasCriticalFailure) {
    return HealthStatus.UNHEALTHY;
  }

  const hasIncompleteReport = resources.some(
    (resource) => resource.status === "unknown",
  );

  if (hasIncompleteReport) {
    return HealthStatus.UNKNOWN;
  }

  const hasNonCriticalFailure = resources.some(
    (resource) =>
      !resource.isCritical &&
      (!resource.isReachable ||
        resource.status === "stopped" ||
        resource.status === "failed"),
  );

  return hasNonCriticalFailure ? HealthStatus.DEGRADED : HealthStatus.HEALTHY;
};

/** overview data hook backed by the persisted zustand data store */
export const useOverview = (): OverviewData => {
  const servers = useDataStore((state) => state.servers);
  const resources = useDataStore((state) => state.resources);
  const instances = useDataStore((state) => state.instances);
  const hasHydrated = useDataStore((state) => state.hasHydrated);

  return {
    serverCount: servers.length,
    resourceCount: resources.length,
    instanceCount: instances.length,
    healthStatus: calculateHealthStatus(resources, hasHydrated),
  };
};
