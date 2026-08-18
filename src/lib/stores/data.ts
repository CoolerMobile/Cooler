import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { migratingSecureStorage } from "@/lib/hooks/secure";
import type { Instance, Resource, Server } from "@/lib/types/coolify";

type DataState = {
  servers: Server[];
  resources: Resource[];
  instances: Instance[];
  hasHydrated: boolean;
  setServers: (servers: Server[]) => void;
  setResources: (resources: Resource[]) => void;
  setInstances: (instances: Instance[]) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  reset: () => void;
};

/**
 * Central source of truth for Coolify data.
 *
 * The persisted state contains only serializable domain data. Store actions and
 * hydration state are recreated for each app session.
 */
export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      servers: [],
      resources: [],
      instances: [],
      hasHydrated: false,
      setServers: (servers) => set({ servers }),
      setResources: (resources) => set({ resources }),
      setInstances: (instances) => set({ instances }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      reset: () => set({ servers: [], resources: [], instances: [] }),
    }),
    {
      name: "cooler-data",
      storage: createJSONStorage(() => migratingSecureStorage),
      partialize: ({ servers, resources, instances }) => ({
        servers,
        resources,
        instances,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
