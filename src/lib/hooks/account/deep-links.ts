import { isPairLink } from "@/lib/cooler-cloud/session-utils"
import { completePairingFromLink } from "@/lib/hooks/account/session"
import { useAccountStore } from "@/lib/stores/account"
import * as Linking from "expo-linking"
import { useEffect, useRef } from "react"
import { Alert } from "react-native"

/**
 * handle incoming cooler:// deep links
 *
 * reacts to bridge pairing links opened from the camera or from Cooler itself,
 * runs the pairing flow, and reports the result; the oauth sign in redirect is
 * left to the browser session that started it
 */
export const useDeepLinks = () => {
  const url = Linking.useURL()
  const hasHydrated = useAccountStore((state) => state.hasHydrated)
  const handled = useRef<string | null>(null)

  useEffect(() => {
    // wait for the account to rehydrate so the session check is accurate
    if (!hasHydrated) return

    // only act once per unique url, and only on pairing links
    if (!url || url === handled.current || !isPairLink(url)) return
    handled.current = url

    const run = async () => {
      // pairing needs an account
      if (useAccountStore.getState().session === null) {
        Alert.alert("Sign in needed", "Sign in to CoolerCloud before pairing a bridge.")
        return
      }

      try {
        const link = await completePairingFromLink(url)
        Alert.alert("Bridge paired", `${link.name} is linked, and this device will receive its notifications.`)
      } catch (error) {
        Alert.alert("Pairing failed", error instanceof Error ? error.message : "Could not pair the bridge.")
      }
    }

    void run()
  }, [url, hasHydrated])
}
