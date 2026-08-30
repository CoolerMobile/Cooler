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
