import type { Deployment, DeploymentFilters } from "@/lib/types/deployment"
import { create } from "zustand"

type DeploymentState = {
  deployments: Deployment[]
  filters: DeploymentFilters
  watchedDeploymentIds: string[]
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  updatedAt: number | null
  setDeployments: (deployments: Deployment[]) => void
  setFilters: (filters: Partial<DeploymentFilters>) => void
  watchDeployment: (id: string) => void
  unwatchDeployment: (id: string) => void
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

/** Session-scoped deployment UI and API state. */
export const useDeploymentStore = create<DeploymentState>((set) => ({
  deployments: [],
  filters: DEFAULT_FILTERS,
  watchedDeploymentIds: [],
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
  setRequestState: (requestState) => set(requestState),
  updateDeployment: (id, deployment) =>
    set((state) => ({
      deployments: state.deployments.map((item) => (item.id === id ? { ...item, ...deployment } : item)),
    })),
}))
