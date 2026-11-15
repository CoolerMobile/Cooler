import { pushPreferencesChanged } from "@/lib/cooler-cloud/preferences"
import { ensurePushRegistration, syncBridgeEvents, syncPushPreferences } from "@/lib/hooks/account/session"
import { useAccountStore } from "@/lib/stores/account"
import { useSettingsStore } from "@/lib/stores/settings"
import { useEffect } from "react"
import { AppState } from "react-native"

// reading the archive walks the keychain, so quick app switches reuse a recent sync
const MINIMUM_SYNC_INTERVAL_MS = 60 * 1000

// settings pickers fire on every change, only the settled value is sent
const PREFERENCE_DEBOUNCE_MS = 1000

let lastSyncAt = 0

/** bring push registration, preferences and the event archive up to date */
const syncBridges = async () => {
  if (useAccountStore.getState().session === null) return
  if (Date.now() - lastSyncAt < MINIMUM_SYNC_INTERVAL_MS) return
  lastSyncAt = Date.now()

  await ensurePushRegistration()
  // also picks up a new time zone after travelling
  await syncPushPreferences()
  await syncBridgeEvents()
}

/**
 * keep linked bridges in sync while the app is in use
 *
 * runs on launch and whenever the app returns to the foreground, so every
 * bridge can push to this device, knows its quiet hours and muted categories,
 * and events presented while the app was closed, such as by the ios
 * notification service extension, reach the archive; preference changes are
 * sent as soon as they settle
 */
export const useBridgeSync = () => {
  const hasHydrated = useAccountStore((state) => state.hasHydrated)
  const hasHydratedSettings = useSettingsStore((state) => state.hasHydrated)

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

  useEffect(() => {
    // hydration itself is not a change worth sending
    if (!hasHydrated || !hasHydratedSettings) return

    let timer: ReturnType<typeof setTimeout> | undefined

    const unsubscribe = useSettingsStore.subscribe((state, previous) => {
      if (!pushPreferencesChanged(state.settings, previous.settings)) return
      if (useAccountStore.getState().session === null) return

      clearTimeout(timer)
      timer = setTimeout(() => void syncPushPreferences(), PREFERENCE_DEBOUNCE_MS)
    })

    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [hasHydrated, hasHydratedSettings])
}
