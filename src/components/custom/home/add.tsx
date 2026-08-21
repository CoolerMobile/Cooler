import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Plus } from "lucide-react-native"

export const MainAdd = () => {
  return (
    <Button variant="ghost">
      <Icon as={Plus} />
    </Button>
  )
}
