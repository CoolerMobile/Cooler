import { setDemoModeActive } from "@/lib/demo/runtime"
import { migratingSecureStorage } from "@/lib/hooks/secure"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

type DemoState = {
  /** whether the app runs on sample data */
  enabled: boolean
  hasHydrated: boolean
  setEnabled: (enabled: boolean) => void
  setHasHydrated: (hasHydrated: boolean) => void
}

/**
 * demo mode flag
 *
 * persisted so a demo survives restarts, and mirrored into the demo runtime so
 * the network clients can check it without importing the store
 */
export const useDemoStore = create<DemoState>()(
  persist(
    (setState) => ({
      enabled: false,
      hasHydrated: false,
      setEnabled: (enabled) => {
        setDemoModeActive(enabled)
        setState({ enabled })
      },
      setHasHydrated: (hasHydrated) => setState({ hasHydrated }),
    }),
    {
      name: "cooler-demo",
      storage: createJSONStorage(() => migratingSecureStorage),
      partialize: ({ enabled }) => ({ enabled }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error("[demo] hydration failed:", error)
        setDemoModeActive(state?.enabled ?? false)
        state?.setHasHydrated(true)
      },
    }
  )
)

/** convenience selector for whether demo mode is on */
export const useIsDemo = () => useDemoStore((state) => state.enabled)
