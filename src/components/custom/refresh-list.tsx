import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { RefreshCw } from "lucide-react-native"

type Props = {
  onPress: () => void
}

export const RefreshList = ({ onPress }: Props) => {
  return (
    <Button variant="ghost" onPress={onPress}>
      <Icon as={RefreshCw} />
    </Button>
  )
}
