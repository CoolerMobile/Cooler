import { ensurePushRegistration, syncBridgeEvents } from "@/lib/hooks/account/session"
import { useAccountStore } from "@/lib/stores/account"
import { useEffect } from "react"
import { AppState } from "react-native"

// reading the archive walks the keychain, so quick app switches reuse a recent sync
const MINIMUM_SYNC_INTERVAL_MS = 60 * 1000

let lastSyncAt = 0

/** bring push registration and the event archive up to date */
const syncBridges = async () => {
  if (useAccountStore.getState().session === null) return
  if (Date.now() - lastSyncAt < MINIMUM_SYNC_INTERVAL_MS) return
  lastSyncAt = Date.now()

  await ensurePushRegistration()
  await syncBridgeEvents()
}

/**
 * keep linked bridges in sync while the app is in use
 *
 * runs on launch and whenever the app returns to the foreground, so every
 * bridge can push to this device and events presented while the app was
 * closed, such as by the ios notification service extension, reach the archive
 */
export const useBridgeSync = () => {
  const hasHydrated = useAccountStore((state) => state.hasHydrated)

  useEffect(() => {
    // wait for the account to rehydrate so the session check is accurate
    if (!hasHydrated) return

    const run = () =>
      void syncBridges().catch((error) => console.error("[account] bridge sync failed:", error))

    run()

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") run()
    })

    return () => subscription.remove()
  }, [hasHydrated])
}
