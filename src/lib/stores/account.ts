import { migratingSecureStorage } from "@/lib/hooks/secure"
import type { AccountState } from "@/lib/types/account"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

/**
 * coolercloud account store
 *
 * holds the account session, linked bridges, their exchanged sessions and the
 * registered device ids, persisted through the same secure storage the settings
 * store uses
 */
export const useAccountStore = create<AccountState>()(
  persist(
    (setState) => ({
      session: null,
      bridges: [],
      bridgeSessions: {},
      deviceIds: {},
      hasHydrated: false,

      setSession: (session) => setState({ session }),
      setBridges: (bridges) => setState({ bridges }),
      setBridgeSession: (session) =>
        setState((state) => ({
          bridgeSessions: { ...state.bridgeSessions, [session.cloudBridgeId]: session },
        })),
      clearBridgeSession: (cloudBridgeId) =>
        setState((state) => {
          const bridgeSessions = { ...state.bridgeSessions }
          delete bridgeSessions[cloudBridgeId]
          return { bridgeSessions }
        }),
      setDeviceId: (cloudBridgeId, deviceId) =>
        setState((state) => ({ deviceIds: { ...state.deviceIds, [cloudBridgeId]: deviceId } })),
      removeBridge: (cloudBridgeId) =>
        setState((state) => {
          const bridgeSessions = { ...state.bridgeSessions }
          const deviceIds = { ...state.deviceIds }
          delete bridgeSessions[cloudBridgeId]
          delete deviceIds[cloudBridgeId]
          return {
            bridges: state.bridges.filter((link) => link.cloudBridgeId !== cloudBridgeId),
            bridgeSessions,
            deviceIds,
          }
        }),
      reset: () => setState({ session: null, bridges: [], bridgeSessions: {}, deviceIds: {} }),
      setHasHydrated: (hasHydrated) => setState({ hasHydrated }),
    }),
    {
      name: "cooler-account",
      storage: createJSONStorage(() => migratingSecureStorage),
      partialize: ({ session, bridges, bridgeSessions, deviceIds }) => ({
        session,
        bridges,
        bridgeSessions,
        deviceIds,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error("[account] hydration failed:", error)
        state?.setHasHydrated(true)
      },
    }
  )
)

/** convenience selector for whether an account session is present */
export const useIsSignedIn = () => useAccountStore((state) => state.session !== null)
