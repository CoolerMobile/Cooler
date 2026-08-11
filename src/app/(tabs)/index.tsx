import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { OverviewData, useOverview } from "@/lib/hooks/data/overview";
import { Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";

export default function OverviewScreen() {
  // overview data
  const { data } = useOverview();
  const [overviewData, setOverviewData] = useState<OverviewData>();
  const total =
    (overviewData?.instanceCount ?? 0) +
    (overviewData?.resourceCount ?? 0) +
    (overviewData?.serverCount ?? 0);

  // get data on mount
  useEffect(() => {
    const getData = async () => {
      setOverviewData(await data());
    };

    getData();
  }, [data]);

  // screen
  return (
    <View className="flex flex-col gap-2">
      {/* main grid */}
      <View className="grid grid-cols-2">
        {/* no data to show */}
        {!total && (
          <View className="h-full w-full items-center justify-center gap-4">
            <Text className="text-center text-lg">You have no Servers</Text>
            <Button size="sm">
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
