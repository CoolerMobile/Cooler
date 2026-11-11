import { BottomSheet, BottomSheetTextInput } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Label } from "@/components/ui/label"
import { Text } from "@/components/ui/text"
import { codeFromScan, isPairLink } from "@/lib/cooler-cloud/session-utils"
import { useAccount } from "@/lib/hooks/account/session"
import { useAccountStore } from "@/lib/stores/account"
import { CameraView, useCameraPermissions } from "expo-camera"
import { CloudCheck, KeyRound, QrCode, X } from "lucide-react-native"
import { useRef, useState } from "react"
import { ActivityIndicator, Alert, View } from "react-native"

type CoolerCloudSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

/**
 * coolercloud sign in sheet
 *
 * offers the browser oauth flow with manual code entry and qr scanning as
 * alternatives, or the signed in account with a sign out action
 *
 * the qr scanner renders inline inside this native sheet rather than in a
 * separate react-native modal: stacking an rn modal on top of the native
 * sheet silently fails to present on ios and leaves a touch-blocking layer
 * behind once dismissed
 */
export const CoolerCloudSheet = ({ open, onOpenChange }: CoolerCloudSheetProps) => {
  const { signInWithBrowser, completeSignInWithCode, signOut, completePairingFromLink } = useAccount()
  const session = useAccountStore((state) => state.session)

  const [permission, requestPermission] = useCameraPermissions()

  const [busy, setBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [codeValue, setCodeValue] = useState("")
  const [scannerOpen, setScannerOpen] = useState(false)
  // a ref, not state, so the camera's rapid repeat callbacks see it flip at once
  const scanHandled = useRef(false)
  // what the scanner is scanning for: a sign in code or a bridge pairing link
  const [scanMode, setScanMode] = useState<"signin" | "pair">("signin")

  const close = () => {
    onOpenChange(false)
    setManualOpen(false)
    setCodeValue("")
    setScannerOpen(false)
  }

  const runSignIn = async (action: () => Promise<unknown>) => {
    try {
      setBusy(true)
      await action()
      close()
    } catch (error) {
      Alert.alert("Sign in failed", errorMessage(error, "Could not sign in to CoolerCloud."))
    } finally {
      setBusy(false)
    }
  }

  const runPairing = async (scanned: string) => {
    try {
      setBusy(true)
      const link = await completePairingFromLink(scanned)
      close()
      Alert.alert("Bridge paired", `${link.name} is linked, and this device will receive its notifications.`)
    } catch (error) {
      Alert.alert("Pairing failed", errorMessage(error, "Could not pair the bridge."))
    } finally {
      setBusy(false)
    }
  }

  const openScanner = async (mode: "signin" | "pair" = "signin") => {
    if (busy) return

    let granted = permission?.granted ?? false
    if (!granted) {
      const result = await requestPermission()
      granted = result.granted
    }

    if (!granted) {
      Alert.alert(
        "Camera access needed",
        mode === "pair"
          ? "Enable camera access in Settings to scan a bridge pairing code."
          : "Enable camera access in Settings to scan your CoolerCloud sign in code."
      )
      return
    }

    setScanMode(mode)
    scanHandled.current = false
    setScannerOpen(true)
  }

  const handleScan = (scanned: string) => {
    if (scanHandled.current) return
    scanHandled.current = true
    setScannerOpen(false)

    // pairing mode expects a bridge deep link
    if (scanMode === "pair") {
      if (!isPairLink(scanned)) {
        Alert.alert("Invalid code", "That QR code is not a bridge pairing code.")
        return
      }
      void runPairing(scanned)
      return
    }

    const code = codeFromScan(scanned)
    if (!code) {
      Alert.alert("Invalid code", "That QR code did not contain a CoolerCloud sign in code.")
      return
    }
    void runSignIn(() => completeSignInWithCode(code))
  }

  const handleSignOut = async () => {
    try {
      setBusy(true)
      await signOut()
      close()
    } catch (error) {
      Alert.alert("Sign out failed", errorMessage(error, "Could not sign out of CoolerCloud."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      key="cooler-cloud-sheet"
      index={open ? 0 : -1}
      onDismiss={close}
      enablePanDownToClose
      snapPoints={["60%"]}>
      {scannerOpen ? (
        <View className="gap-5 p-4">
          <View className="gap-1">
            <Text className="text-xl font-semibold">Scan QR</Text>
            <Text className="text-sm text-muted-foreground">
              {scanMode === "pair"
                ? "Point your camera at the bridge pairing QR code from CoolerCloud."
                : "Point your camera at the CoolerCloud sign in QR code."}
            </Text>
          </View>

          <View className="h-64 w-full overflow-hidden rounded-2xl bg-black">
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => handleScan(data)}
            />
          </View>

          <Button variant="outline" onPress={() => setScannerOpen(false)} disabled={busy}>
            <Icon as={X} />
            <Text>Cancel</Text>
          </Button>
        </View>
      ) : (
        <View className="gap-5 p-4">
          <View className="gap-1">
            <Text className="text-xl font-semibold">CoolerCloud</Text>
            <Text className="text-sm text-muted-foreground">
              {session
                ? "Your account is linked. Coolify events are delivered to this device as push notifications."
                : "Sign in to receive Coolify notifications through CoolerBridge, even when the app is closed."}
            </Text>
          </View>

          {session ? (
            <View className="gap-4">
              <View className="flex-row items-center gap-3 rounded-md border border-input bg-card p-4">
                <Icon as={CloudCheck} />
                <View className="flex-1">
                  <Text className="font-medium">{session.user.name ?? "Signed in"}</Text>
                  <Text className="text-sm text-muted-foreground">{session.user.email}</Text>
                </View>
              </View>
              <Button variant="outline" onPress={() => openScanner("pair")} disabled={busy}>
                <Icon as={QrCode} />
                <Text>Pair a Bridge</Text>
              </Button>
              <Button variant="destructive" onPress={handleSignOut} disabled={busy}>
                {busy ? <ActivityIndicator /> : null}
                <Text>Sign out</Text>
              </Button>
            </View>
          ) : (
            <View className="gap-4">
              <Button onPress={() => runSignIn(signInWithBrowser)} disabled={busy}>
                {busy ? <ActivityIndicator /> : <Icon as={CloudCheck} />}
                <Text>Continue with CoolerCloud</Text>
              </Button>

              <View className="flex-row gap-3">
                <Button
                  className="flex-1"
                  variant="outline"
                  onPress={() => setManualOpen((value) => !value)}
                  disabled={busy}>
                  <Icon as={KeyRound} />
                  <Text>Enter code</Text>
                </Button>
                <Button
                  className="flex-1"
                  variant="outline"
                  onPress={() => openScanner("signin")}
                  disabled={busy}>
                  <Icon as={QrCode} />
                  <Text>Scan QR</Text>
                </Button>
              </View>

              {manualOpen && (
                <View className="gap-2">
                  <Label>Sign in code</Label>
                  <BottomSheetTextInput
                    className="rounded-md border border-input bg-card px-3 py-4 text-foreground"
                    autoCorrect={false}
                    autoCapitalize="none"
                    placeholder="Paste the code from CoolerCloud"
                    value={codeValue}
                    onChangeText={setCodeValue}
                  />
                  <Button
                    onPress={() => runSignIn(() => completeSignInWithCode(codeValue))}
                    disabled={busy || codeValue.trim().length === 0}>
                    {busy ? <ActivityIndicator /> : null}
                    <Text>Sign in</Text>
                  </Button>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </BottomSheet>
  )
}
