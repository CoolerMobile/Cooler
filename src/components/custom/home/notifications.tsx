import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { router } from "expo-router";
import { Bell } from "lucide-react-native";

export const MainNotifications = () => {
  return (
    <Button variant="ghost" onPress={() => router.navigate("/notifications")}>
      <Icon as={Bell} />
    </Button>
  );
};
