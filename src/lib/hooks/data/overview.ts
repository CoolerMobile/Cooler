import { useDataStore } from "@/lib/stores/data";
import { HealthStatus, type Resource } from "@/lib/types/coolify";
export { HealthStatus } from "@/lib/types/coolify";

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
export const useOverview = () => {
  /** gets the total number of servers in the zustand store */
  const getServerCount = async (): Promise<number> =>
    useDataStore.getState().servers.length;

  /** gets the total number of resources in the zustand store */
  const getResourceCount = async (): Promise<number> =>
    useDataStore.getState().resources.length;

  /** gets the total number of instances in the Zustand store */
  const getInstanceCount = async (): Promise<number> =>
    useDataStore.getState().instances.length;

  /** gets the overall health from the latest persisted resource reports */
  const getHealthStatus = async (): Promise<HealthStatus> => {
    const { hasHydrated, resources } = useDataStore.getState();
    return calculateHealthStatus(resources, hasHydrated);
  };

  /** gets the overview from one consistent zustand state snapshot */
  const data = async (): Promise<OverviewData> => {
    const { hasHydrated, instances, resources, servers } =
      useDataStore.getState();

    return {
      serverCount: servers.length,
      resourceCount: resources.length,
      instanceCount: instances.length,
      healthStatus: calculateHealthStatus(resources, hasHydrated),
    };
  };

  return {
    data,
    getHealthStatus,
    getInstanceCount,
    getResourceCount,
    getServerCount,
  };
};
