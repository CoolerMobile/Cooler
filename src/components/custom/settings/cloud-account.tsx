import { CoolerCloudSheet } from "@/components/custom/account/cooler-cloud-sheet"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useAccountStore } from "@/lib/stores/account"
import { Cloud, CloudCheck } from "lucide-react-native"
import { useState } from "react"

/**
 * coolercloud account button for the settings header
 *
 * the icon reflects the sign in state and opens the account sheet
 */
export const CloudAccount = () => {
  const [open, setOpen] = useState(false)
  const session = useAccountStore((state) => state.session)

  return (
    <>
      <Button variant="ghost" accessibilityLabel="CoolerCloud account" onPress={() => setOpen(true)}>
        <Icon as={session ? CloudCheck : Cloud} />
      </Button>
      <CoolerCloudSheet open={open} onOpenChange={setOpen} />
    </>
  )
}
