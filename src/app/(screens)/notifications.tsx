import { Button } from "@/components/ui/button";
import BottomSheet from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useScreenOptions } from "@/lib/hooks/screen-options";
import {
  getNotifications,
  StoredNotification,
} from "@/lib/storage/notifications";
import { Stack } from "expo-router";
import { Filter } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ListRenderItemInfo, View } from "react-native";
import Animated from "react-native-reanimated";

export default function NotificationsScreen() {
  // screen options
  const { options } = useScreenOptions();

  // notifications
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const [notifInfoOpen, setNotifInfoOpen] = useState(false);

  // get notifications on mount
  useEffect(() => {
    const fetchData = async () => {
      const data = await getNotifications();
      setNotifications(data);
    };

    fetchData();
  }, []);

  // screen
  return (
    <>
      <Stack.Screen
        options={options({
          title: "Notifications",
          headerBackButtonDisplayMode: "minimal",
          headerRight: () => <FilterNotifications />,
        })}
      />
      <View className="flex-1 py-2 px-4 gap-4">
        {/* no notifications */}
        {!notifications.length ? (
          <View className="flex-1 items-center justify-center gap-3">
            <Text className="text-center">No Stored Notifications</Text>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => setNotifInfoOpen(true)}
            >
              <Text className="text-xs">What is this?</Text>
            </Button>
          </View>
        ) : (
          <View className="flex-1">
            <Animated.FlatList
              data={notifications}
              renderItem={(item) => <NotificationItem item={item} />}
            />
          </View>
        )}
      </View>

      {/* info sheet */}
      <BottomSheet
        key="notif-info-sheet"
        index={notifInfoOpen ? 0 : -1}
        onDismiss={() => setNotifInfoOpen(false)}
        enablePanDownToClose
        snapPoints={["25%"]}
      >
        <View className="gap-4 p-4">
          <Text className="font-semibold text-lg text-center">
            Stored Notifications
          </Text>

          {/* info */}
          <Text className="text-muted-foreground">
            Every time you get a notification (local or not), it is encrypted
            and stored on your device. This is where you can see all of your
            notifications, from the moment Cooler was installed.
          </Text>

          <Text className="text-muted-foreground">
            If you uninstall and re-install the app, your stored notifications
            will be <Text className="font-semibold">permanently lost</Text>.
          </Text>
        </View>
      </BottomSheet>
    </>
  );
}

// notification item
const NotificationItem = ({
  item,
}: {
  item: ListRenderItemInfo<StoredNotification>;
}) => {
  return <></>;
};

// filter button
const FilterNotifications = () => {
  return (
    <Button variant="ghost">
      <Icon as={Filter} />
    </Button>
  );
};
