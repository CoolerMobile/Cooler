import { QrScanner } from "@/components/custom/account/qr-scanner"
import { BottomSheet, BottomSheetTextInput } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Label } from "@/components/ui/label"
import { Text } from "@/components/ui/text"
import { codeFromScan } from "@/lib/cooler-cloud/session-utils"
import { useAccount } from "@/lib/hooks/account/session"
import { useAccountStore } from "@/lib/stores/account"
import { CloudCheck, KeyRound, QrCode } from "lucide-react-native"
import { useState } from "react"
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
 */
export const CoolerCloudSheet = ({ open, onOpenChange }: CoolerCloudSheetProps) => {
  const { signInWithBrowser, completeSignInWithCode, signOut } = useAccount()
  const session = useAccountStore((state) => state.session)

  const [busy, setBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [codeValue, setCodeValue] = useState("")
  const [scannerOpen, setScannerOpen] = useState(false)

  const close = () => {
    onOpenChange(false)
    setManualOpen(false)
    setCodeValue("")
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

  const handleScan = (scanned: string) => {
    setScannerOpen(false)
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
    <>
      <BottomSheet
        key="cooler-cloud-sheet"
        index={open ? 0 : -1}
        onDismiss={close}
        enablePanDownToClose
        snapPoints={["60%"]}>
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
                  onPress={() => setScannerOpen(true)}
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
      </BottomSheet>

      <QrScanner visible={scannerOpen} onScan={handleScan} onCancel={() => setScannerOpen(false)} />
    </>
  )
}
