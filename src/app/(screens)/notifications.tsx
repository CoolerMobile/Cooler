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
import {
  ListRenderItemInfo,
  Platform,
  useWindowDimensions,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { ListItem } from "@/components/custom/data/list-item";
import { upperFirstLetter } from "@/lib/utils";
import { Table, TableColumn, TableRow } from "@/components/custom/table";
import Spacer from "@/components/custom/spacer";

const TABLE_ROW_HEIGHT = 36;
const TABLE_BORDER_HEIGHT = 2;
const TABLE_CELL_HORIZONTAL_PADDING = 32;
const TABLE_CHARACTER_WIDTH = 8;
const MAX_TABLE_COLUMN_WIDTH = 480;
const MAX_VISIBLE_TABLE_ROWS = 6;
const DETAILS_CONTENT_HEIGHT = 240;
const MAX_SHEET_HEIGHT_FRACTION = 0.85;
const MIN_SHEET_HEIGHT_FRACTION = 0.38;

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
      setNotifications([...data].sort((a, b) => b.id - a.id));
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
              className="h-full"
              overScrollMode="auto"
              alwaysBounceVertical={false}
              data={notifications}
              keyExtractor={(notification) => String(notification.id)}
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
  // data
  const data = item.item;
  const tableData = data.data;
  const { height: windowHeight } = useWindowDimensions();
  const [tableWidth, setTableWidth] = useState(0);
  const rows: (TableRow & { title: string; value: string })[] = tableData
    ? Object.entries(tableData).map(([key, value]) => ({
        id: key,
        title: key,
        value:
          typeof value === "string"
            ? value
            : (JSON.stringify(value) ?? String(value)),
      }))
    : [];
  const availableTableWidth = Math.max(tableWidth - TABLE_BORDER_HEIGHT, 200);
  const estimateColumnWidth = (values: string[]) =>
    Math.min(
      Math.max(...values.map((value) => value.length)) * TABLE_CHARACTER_WIDTH +
        TABLE_CELL_HORIZONTAL_PADDING,
      MAX_TABLE_COLUMN_WIDTH,
    );
  const preferredFieldWidth = estimateColumnWidth([
    "Field",
    ...rows.map((row) => row.title),
  ]);
  const preferredValueWidth = estimateColumnWidth([
    "Value",
    ...rows.map((row) => row.value),
  ]);
  const fieldWidth = Math.max(preferredFieldWidth, availableTableWidth * 0.45);
  const valueWidth = Math.max(
    preferredValueWidth,
    availableTableWidth - fieldWidth,
  );
  const columns: TableColumn<TableRow & { title: string; value: string }>[] = [
    { key: "title", title: "Field", width: fieldWidth },
    { key: "value", title: "Value", width: valueWidth },
  ];

  // info sheet state
  const [infoOpen, setInfoOpen] = useState(false);
  const visibleTableRows = Math.min(rows.length, MAX_VISIBLE_TABLE_ROWS);
  const tableHeight =
    TABLE_ROW_HEIGHT * (visibleTableRows + 1) + TABLE_BORDER_HEIGHT;
  const maxSheetHeight = Math.min(
    DETAILS_CONTENT_HEIGHT + tableHeight,
    windowHeight * MAX_SHEET_HEIGHT_FRACTION,
  );
  const minSheetHeight = Math.min(
    maxSheetHeight,
    windowHeight * MIN_SHEET_HEIGHT_FRACTION,
  );
  const detailsSnapPoints = tableData
    ? Platform.OS === "android" || minSheetHeight === maxSheetHeight
      ? [maxSheetHeight]
      : [minSheetHeight, maxSheetHeight]
    : ["18%"];

  // ui
  return (
    <>
      <ListItem
        title={data.title}
        description={`Source: ${upperFirstLetter(data.source)}`}
        onPress={() => setInfoOpen(true)}
      />

      {/* extra info sheet */}
      <BottomSheet
        key="notif-extra-info-sheet"
        index={infoOpen ? detailsSnapPoints.length - 1 : -1}
        onDismiss={() => setInfoOpen(false)}
        enablePanDownToClose
        snapPoints={detailsSnapPoints}
      >
        <View className="gap-4 p-4">
          <Text className="font-semibold text-lg text-center">
            Notification Details
          </Text>

          {/* info */}
          <Text className="text-muted-foreground">
            This notification originated from{" "}
            {data.source === "local"
              ? "your device"
              : "one of your Coolify servers"}
            .
          </Text>

          <Text className="text-muted-foreground">
            It was delivered at{" "}
            <Text className="font-semibold">
              {new Date(data.deliveredAt ?? "").toLocaleTimeString()}
            </Text>
            , on{" "}
            <Text className="font-semibold">
              {new Date(data.deliveredAt ?? "").toLocaleDateString()}
            </Text>
            .
          </Text>

          {tableData && (
            <View
              onLayout={(event) => {
                const nextWidth = event.nativeEvent.layout.width;
                setTableWidth((currentWidth) =>
                  currentWidth === nextWidth ? currentWidth : nextWidth,
                );
              }}
            >
              <Text className="text-muted-foreground">
                Here's the data included in this notification:
              </Text>
              <Spacer space={20} />
              <Table
                data={rows}
                columns={columns}
                initialItemsPerPage={Math.max(rows.length, 1)}
                containerStyle={{ height: tableHeight, flex: 0 }}
                density="compact"
                enableSelection={false}
                onDensityChange={undefined}
                onSearchChange={undefined}
                onSort={undefined}
                onToggleColumn={undefined}
                pagination={undefined}
                scrollEnabled={rows.length > MAX_VISIBLE_TABLE_ROWS}
              />
            </View>
          )}
        </View>
      </BottomSheet>
    </>
  );
};

// filter button
const FilterNotifications = () => {
  return (
    <Button variant="ghost">
      <Icon as={Filter} />
    </Button>
  );
};
