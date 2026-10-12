import type { ServerData } from "@/lib/hooks/servers/connection"
import { migratingSecureStorage } from "@/lib/hooks/secure"
import { collectHealthIssues } from "@/lib/coolify/health"
import type { Instance, Resource } from "@/lib/types/coolify"
import { create } from "zustand"
import { persist, type PersistStorage } from "zustand/middleware"

type PersistedDataState = {
  servers: ServerData[]
  resources: Resource[]
  instances: Instance[]
  dismissedHealthIssueIds: string[]
}

type DataState = PersistedDataState & {
  hasHydrated: boolean
  hasSynced: boolean
  failedServerIds: string[]
  lastSyncedAt: number | null
  dismissHealthIssue: (issueId: string) => void
  restoreHealthIssues: () => void
  setServers: (servers: ServerData[]) => void
  setResources: (resources: Resource[]) => void
  setResourceStatus: (resourceId: string, data: Pick<Resource, "rawStatus" | "status">) => void
  setResourceLogs: (resourceId: string, data: Pick<Resource, "logs" | "logsUpdatedAt">) => void
  setInstances: (instances: Instance[]) => void
  removeServerData: (serverId: string) => void
  setInfrastructure: (data: {
    resources: Resource[]
    instances: Instance[]
    failedServerIds: string[]
    lastSyncedAt: number
  }) => void
  setHasHydrated: (hasHydrated: boolean) => void
  reset: () => void
}

const DATA_STORAGE_KEY = "cooler-data"
const EMPTY_DATA: PersistedDataState = {
  servers: [],
  resources: [],
  instances: [],
  dismissedHealthIssueIds: [],
}

const EMPTY_SYNC_STATE = {
  hasSynced: false,
  failedServerIds: [] as string[],
  lastSyncedAt: null as number | null,
}

const parseCollection = <T>(value: string | null): T[] | undefined => {
  if (value === null) return undefined

  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw Error("invalid stored data")

  return parsed as T[]
}

const normalizeResources = (resources: Resource[]): Resource[] =>
  resources.map((resource) => ({
    ...resource,
    logs: Array.isArray(resource.logs) ? resource.logs : [],
    logsUpdatedAt: typeof resource.logsUpdatedAt === "number" ? resource.logsUpdatedAt : null,
  }))

/** Runtime logs stay in memory and are refreshed from Coolify instead of persisted. */
const withoutResourceLogs = (resources: Resource[]): Resource[] =>
  resources.map((resource) => ({ ...resource, logs: [], logsUpdatedAt: null }))

/**
 * persists each collection under the same raw JSON keys
 * used by the server connection flow
 *
 * the former `cooler-data` Zustand envelope is read once as
 * a fallback, then removed after the first successful write
 */
const dataStorage: PersistStorage<PersistedDataState> = {
  getItem: async () => {
    const [storedServers, storedResources, storedInstances, storedDismissedIssues, legacyValue] =
      await Promise.all([
        migratingSecureStorage.getItem("servers"),
        migratingSecureStorage.getItem("resources"),
        migratingSecureStorage.getItem("instances"),
        migratingSecureStorage.getItem("dismissed-health-issues"),
        migratingSecureStorage.getItem(DATA_STORAGE_KEY),
      ])

    if (
      storedServers === null &&
      storedResources === null &&
      storedInstances === null &&
      storedDismissedIssues === null &&
      legacyValue === null
    ) {
      return null
    }

    let legacyState: Partial<PersistedDataState> = {}
    if (legacyValue !== null) {
      const legacy: unknown = JSON.parse(legacyValue)
      if (legacy && typeof legacy === "object" && "state" in legacy) {
        legacyState = (legacy as { state: Partial<PersistedDataState> }).state
      }
    }

    return {
      state: {
        servers: parseCollection<ServerData>(storedServers) ?? legacyState.servers ?? [],
        resources: normalizeResources(
          parseCollection<Resource>(storedResources) ?? legacyState.resources ?? []
        ),
        instances: parseCollection<Instance>(storedInstances) ?? legacyState.instances ?? [],
        dismissedHealthIssueIds:
          parseCollection<string>(storedDismissedIssues) ?? legacyState.dismissedHealthIssueIds ?? [],
      },
    }
  },
  setItem: async (_name, { state }) => {
    await Promise.all([
      migratingSecureStorage.setItem("servers", JSON.stringify(state.servers)),
      migratingSecureStorage.setItem("resources", JSON.stringify(state.resources)),
      migratingSecureStorage.setItem("instances", JSON.stringify(state.instances)),
      migratingSecureStorage.setItem(
        "dismissed-health-issues",
        JSON.stringify(state.dismissedHealthIssueIds)
      ),
    ])
    await migratingSecureStorage.removeItem(DATA_STORAGE_KEY)
  },
  removeItem: async () => {
    await Promise.all([
      migratingSecureStorage.removeItem("servers"),
      migratingSecureStorage.removeItem("resources"),
      migratingSecureStorage.removeItem("instances"),
      migratingSecureStorage.removeItem("dismissed-health-issues"),
      migratingSecureStorage.removeItem(DATA_STORAGE_KEY),
    ])
  },
}

/** central source of truth for persisted Coolify data */
export const useDataStore = create<DataState>()(
  persist<DataState, [], [], PersistedDataState>(
    (set) => ({
      ...EMPTY_DATA,
      ...EMPTY_SYNC_STATE,
      hasHydrated: false,
      setServers: (servers) => set({ servers }),
      setResources: (resources) => set({ resources }),
      setResourceStatus: (resourceId, data) =>
        set((state) => ({
          resources: state.resources.map((resource) =>
            resource.id === resourceId ? { ...resource, ...data } : resource
          ),
        })),
      setResourceLogs: (resourceId, data) =>
        set((state) => ({
          resources: state.resources.map((resource) =>
            resource.id === resourceId ? { ...resource, ...data } : resource
          ),
        })),
      setInstances: (instances) => set({ instances }),
      dismissHealthIssue: (issueId) =>
        set((state) => ({
          dismissedHealthIssueIds: state.dismissedHealthIssueIds.includes(issueId)
            ? state.dismissedHealthIssueIds
            : [...state.dismissedHealthIssueIds, issueId],
        })),
      restoreHealthIssues: () => set({ dismissedHealthIssueIds: [] }),
      removeServerData: (serverId) =>
        set((state) => ({
          servers: state.servers.filter((server) => server.id !== serverId),
          resources: state.resources.filter((resource) => resource.connectionId !== serverId),
          instances: state.instances.filter((instance) => instance.connectionId !== serverId),
          failedServerIds: state.failedServerIds.filter((failedServerId) => failedServerId !== serverId),
          dismissedHealthIssueIds: state.dismissedHealthIssueIds.filter(
            (issueId) => !issueId.includes(serverId)
          ),
        })),
      setInfrastructure: ({ resources, instances, failedServerIds, lastSyncedAt }) =>
        set((state) => {
          const currentResources = new Map(state.resources.map((resource) => [resource.id, resource]))
          const activeServerIds = new Set(state.servers.map((server) => server.id))

          const nextResources = resources
            .filter((resource) => activeServerIds.has(resource.connectionId))
            .map((resource) => {
              const currentResource = currentResources.get(resource.id)
              if (!currentResource) return resource

              return {
                ...resource,
                logs: currentResource.logs,
                logsUpdatedAt: currentResource.logsUpdatedAt,
              }
            })
          const nextInstances = instances.filter((instance) => activeServerIds.has(instance.connectionId))
          const nextFailedServerIds = failedServerIds.filter((serverId) => activeServerIds.has(serverId))
          const activeIssueIds = new Set(
            collectHealthIssues(state.servers, nextResources, nextInstances, true, nextFailedServerIds).map(
              (issue) => issue.id
            )
          )

          return {
            resources: nextResources,
            instances: nextInstances,
            failedServerIds: nextFailedServerIds,
            dismissedHealthIssueIds: state.dismissedHealthIssueIds.filter((issueId) =>
              activeIssueIds.has(issueId)
            ),
            lastSyncedAt,
            hasSynced: true,
          }
        }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      reset: () => set({ ...EMPTY_DATA, ...EMPTY_SYNC_STATE }),
    }),
    {
      name: DATA_STORAGE_KEY,
      storage: dataStorage,
      partialize: ({ servers, resources, instances, dismissedHealthIssueIds }) => ({
        servers,
        resources: withoutResourceLogs(resources),
        instances,
        dismissedHealthIssueIds,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error("[data] hydration failed:", error)
        state?.setHasHydrated(true)
      },
    }
  )
)
