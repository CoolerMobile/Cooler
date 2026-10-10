import type { Deployment, DeploymentFilters } from "@/lib/types/deployment"
import { migratingSecureStorage } from "@/lib/hooks/secure"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

type DeploymentState = {
  deployments: Deployment[]
  filters: DeploymentFilters
  watchedDeploymentIds: string[]
  hasHydratedWatches: boolean
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  updatedAt: number | null
  setDeployments: (deployments: Deployment[]) => void
  setFilters: (filters: Partial<DeploymentFilters>) => void
  watchDeployment: (id: string) => void
  unwatchDeployment: (id: string) => void
  setHasHydratedWatches: (hasHydrated: boolean) => void
  setRequestState: (state: Partial<Pick<DeploymentState, "isLoading" | "isRefreshing" | "error">>) => void
  updateDeployment: (id: string, deployment: Partial<Deployment>) => void
  removeServerData: (serverId: string, serverName: string) => void
}

const DEFAULT_FILTERS: DeploymentFilters = {
  query: "",
  status: "all",
  server: null,
  project: null,
  resource: null,
}

/** Deployment UI/API state with only background notification watches persisted. */
export const useDeploymentStore = create<DeploymentState>()(
  persist(
    (set) => ({
      deployments: [],
      filters: DEFAULT_FILTERS,
      watchedDeploymentIds: [],
      hasHydratedWatches: false,
      isLoading: false,
      isRefreshing: false,
      error: null,
      updatedAt: null,
      setDeployments: (deployments) => set({ deployments, updatedAt: Date.now() }),
      setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
      watchDeployment: (id) =>
        set((state) => ({
          watchedDeploymentIds: state.watchedDeploymentIds.includes(id)
            ? state.watchedDeploymentIds
            : [...state.watchedDeploymentIds, id],
        })),
      unwatchDeployment: (id) =>
        set((state) => ({
          watchedDeploymentIds: state.watchedDeploymentIds.filter((deploymentId) => deploymentId !== id),
        })),
      setHasHydratedWatches: (hasHydratedWatches) => set({ hasHydratedWatches }),
      setRequestState: (requestState) => set(requestState),
      updateDeployment: (id, deployment) =>
        set((state) => ({
          deployments: state.deployments.map((item) => (item.id === id ? { ...item, ...deployment } : item)),
        })),
      removeServerData: (serverId, serverName) =>
        set((state) => {
          const removedDeployments = state.deployments.filter(
            (deployment) => deployment.connectionId === serverId
          )
          const deployments = state.deployments.filter((deployment) => deployment.connectionId !== serverId)
          const removedProjects = new Set(removedDeployments.map((deployment) => deployment.projectName))
          const removedResources = new Set(removedDeployments.map((deployment) => deployment.resourceName))

          return {
            deployments,
            watchedDeploymentIds: state.watchedDeploymentIds.filter(
              (deploymentId) => !deploymentId.startsWith(`${serverId}:`)
            ),
            filters: {
              ...state.filters,
              server: state.filters.server === serverName ? null : state.filters.server,
              project:
                state.filters.project &&
                removedProjects.has(state.filters.project) &&
                !deployments.some((deployment) => deployment.projectName === state.filters.project)
                  ? null
                  : state.filters.project,
              resource:
                state.filters.resource &&
                removedResources.has(state.filters.resource) &&
                !deployments.some((deployment) => deployment.resourceName === state.filters.resource)
                  ? null
                  : state.filters.resource,
            },
          }
        }),
    }),
    {
      name: "cooler-deployment-watches",
      storage: createJSONStorage(() => migratingSecureStorage),
      partialize: ({ watchedDeploymentIds }) => ({ watchedDeploymentIds }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error("[deployments] watch hydration failed:", error)
        state?.setHasHydratedWatches(true)
      },
    }
  )
)
