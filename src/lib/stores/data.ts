import type { ServerData } from "@/lib/hooks/servers/connection"
import { migratingSecureStorage } from "@/lib/hooks/secure"
import type { Instance, Resource } from "@/lib/types/coolify"
import { create } from "zustand"
import { persist, type PersistStorage } from "zustand/middleware"

type PersistedDataState = {
  servers: ServerData[]
  resources: Resource[]
  instances: Instance[]
}

type DataState = PersistedDataState & {
  hasHydrated: boolean
  setServers: (servers: ServerData[]) => void
  setResources: (resources: Resource[]) => void
  setInstances: (instances: Instance[]) => void
  setHasHydrated: (hasHydrated: boolean) => void
  reset: () => void
}

const DATA_STORAGE_KEY = "cooler-data"
const EMPTY_DATA: PersistedDataState = {
  servers: [],
  resources: [],
  instances: [],
}

const parseCollection = <T>(value: string | null): T[] | undefined => {
  if (value === null) return undefined

  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw Error("invalid stored data")

  return parsed as T[]
}

/**
 * persists each collection under the same raw JSON keys
 * used by the server connection flow
 *
 * the former `cooler-data` Zustand envelope is read once as
 * a fallback, then removed after the first successful write
 */
const dataStorage: PersistStorage<PersistedDataState> = {
  getItem: async () => {
    const [storedServers, storedResources, storedInstances, legacyValue] = await Promise.all([
      migratingSecureStorage.getItem("servers"),
      migratingSecureStorage.getItem("resources"),
      migratingSecureStorage.getItem("instances"),
      migratingSecureStorage.getItem(DATA_STORAGE_KEY),
    ])

    if (
      storedServers === null &&
      storedResources === null &&
      storedInstances === null &&
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
        resources: parseCollection<Resource>(storedResources) ?? legacyState.resources ?? [],
        instances: parseCollection<Instance>(storedInstances) ?? legacyState.instances ?? [],
      },
    }
  },
  setItem: async (_name, { state }) => {
    await Promise.all([
      migratingSecureStorage.setItem("servers", JSON.stringify(state.servers)),
      migratingSecureStorage.setItem("resources", JSON.stringify(state.resources)),
      migratingSecureStorage.setItem("instances", JSON.stringify(state.instances)),
    ])
    await migratingSecureStorage.removeItem(DATA_STORAGE_KEY)
  },
  removeItem: async () => {
    await Promise.all([
      migratingSecureStorage.removeItem("servers"),
      migratingSecureStorage.removeItem("resources"),
      migratingSecureStorage.removeItem("instances"),
      migratingSecureStorage.removeItem(DATA_STORAGE_KEY),
    ])
  },
}

/** central source of truth for persisted Coolify data */
export const useDataStore = create<DataState>()(
  persist<DataState, [], [], PersistedDataState>(
    (set) => ({
      ...EMPTY_DATA,
      hasHydrated: false,
      setServers: (servers) => set({ servers }),
      setResources: (resources) => set({ resources }),
      setInstances: (instances) => set({ instances }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      reset: () => set({ ...EMPTY_DATA }),
    }),
    {
      name: DATA_STORAGE_KEY,
      storage: dataStorage,
      partialize: ({ servers, resources, instances }) => ({
        servers,
        resources,
        instances,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error("[data] hydration failed:", error)
        state?.setHasHydrated(true)
      },
    }
  )
)
