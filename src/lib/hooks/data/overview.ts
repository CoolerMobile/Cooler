import { useSecureStorage } from "@/lib/hooks/secure";

enum HealthStatus {
  /** every reachable resource is running and healthy */
  HEALTHY = "Healthy",

  /** core services are healthy, but some resources need attention */
  DEGRADED = "Degraded",

  /** at least one critical resource is stopped, failing, or unreachable */
  UNHEALTHY = "Unhealthy",

  /** not enough information retrieved to decide on a proper status */
  UNKNOWN = "Unknown",
}

type OverviewData = {
  serverCount: number;
  resourceCount: number;
  instanceCount: number;
  healthStatus: HealthStatus;
};

/**
 * overview data hook
 */
export const useOverview = () => {
  // secure store
  const { get } = useSecureStorage();

  /**
   * gets the total number of servers
   */
  const getServerCount = async (): Promise<number> => {
    return await get("servers");
  };

  /**
   * gets the total number of resources
   */
  const getResourceCount = async (): Promise<number> => {
    return await get("resources");
  };

  /**
   * gets the total number of instances
   */
  const getInstanceCount = async (): Promise<number> => {
    return await get("instances");
  };

  /**
   * gets the overall health status
   */
  const getHealthStatus = async (): Promise<HealthStatus> => {
    return HealthStatus.UNKNOWN;
  };

  /**
   * gets main data points:
   *
   * - number of servers
   * - number of resources
   * - number of instances
   * - overall health status
   */
  const data = async (): Promise<OverviewData> => {
    const [serverCount, resourceCount, instanceCount, healthStatus] =
      await Promise.all([
        getServerCount(),
        getResourceCount(),
        getInstanceCount(),
        getHealthStatus(),
      ]);

    return {
      serverCount,
      resourceCount,
      instanceCount,
      healthStatus,
    };
  };

  // return methods
  return { data };
};
