import { PrivateValue } from "@/components/custom/private";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { OverviewData, useOverview } from "@/lib/hooks/data/overview";
import { useFlipPrivacy } from "@/lib/hooks/security/flip-privacy";
import { Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";

export default function OverviewScreen() {
  // overview data
  const overviewData = useOverview();
  const total =
    overviewData.instanceCount +
    overviewData.resourceCount +
    overviewData.serverCount;

  // hidden
  const { isHidden } = useFlipPrivacy();

  // screen
  return (
    <View className="flex flex-col gap-2">
      {/* main grid */}
      <View className="grid grid-cols-2">
        {/* no data to show */}
        {!total && (
          <View className="h-full w-full items-center justify-center gap-4">
            <PrivateValue hidden={isHidden}>
              <Text className="text-center text-lg">You have no Servers</Text>
            </PrivateValue>
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
