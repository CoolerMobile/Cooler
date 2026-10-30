import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { CameraView, useCameraPermissions } from "expo-camera"
import { useState } from "react"
import { Modal, View } from "react-native"

type QrScannerProps = {
  visible: boolean
  onScan: (data: string) => void
  onCancel: () => void
}

/**
 * full screen qr scanner used to read a coolercloud sign in code
 *
 * reports the raw scanned string, the caller normalizes it into a code
 *
 * @param visible whether the scanner modal is shown
 * @param onScan called once with the first scanned value
 * @param onCancel called when the user dismisses the scanner
 */
export const QrScanner = ({ visible, onScan, onCancel }: QrScannerProps) => {
  const [permission, requestPermission] = useCameraPermissions()
  const [handled, setHandled] = useState(false)

  const handleScan = (data: string) => {
    if (handled) return
    setHandled(true)
    onScan(data)
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} onShow={() => setHandled(false)}>
      <View className="flex-1 bg-black">
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => handleScan(data)}
          />
        ) : (
          <View className="flex-1 items-center justify-center gap-4 p-6">
            <Text className="text-center text-white">
              Camera access is needed to scan your CoolerCloud sign in code.
            </Text>
            {!permission?.canAskAgain ? (
              <Text className="text-center text-sm text-white/70">
                Enable camera access in system settings, then try again.
              </Text>
            ) : (
              <Button onPress={requestPermission}>
                <Text>Allow camera</Text>
              </Button>
            )}
          </View>
        )}

        <View className="absolute inset-x-0 bottom-0 p-6">
          <Button variant="outline" onPress={onCancel}>
            <Text>Cancel</Text>
          </Button>
        </View>
      </View>
    </Modal>
  )
}
