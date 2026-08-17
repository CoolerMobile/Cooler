import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useOverview } from "@/lib/hooks/data/overview";
import { useNotifications } from "@/lib/hooks/notifications";
import { useSecureStorage } from "@/lib/hooks/secure";
import { Plus } from "lucide-react-native";
import { View } from "react-native";

export default function OverviewScreen() {
  // overview data
  const overviewData = useOverview();
  const total =
    overviewData.instanceCount +
    overviewData.resourceCount +
    overviewData.serverCount;

  // notifications
  const { get } = useSecureStorage();
  const { sendNotification } = useNotifications();

  // screen
  return (
    <View className="flex flex-col gap-2">
      {/* main grid */}
      <View className="grid grid-cols-2">
        {/* no data to show */}
        {!total && (
          <View className="h-full w-full items-center justify-center gap-4">
            <Text className="text-center text-lg">You have no Servers</Text>
            <Button
              size="sm"
              onPress={async () => {
                // token
                const token = await get("expoToken");

                // send notification
                await sendNotification({
                  to: token,
                  title: "Test Title",
                  body: "Test Body",
                });
              }}
            >
              <Icon as={Plus} />
              <Text>Add Server</Text>
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}

// overview card
const OverviewCard = () => {
  return <Card></Card>;
};
