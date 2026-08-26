import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Plus } from "lucide-react-native"

type Props = { onPress: () => void }

export const MainAdd = ({ onPress }: Props) => {
  return (
    <Button variant="ghost" onPress={onPress}>
      <Icon as={Plus} />
    </Button>
  )
}
