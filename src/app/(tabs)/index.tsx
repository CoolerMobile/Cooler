import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useOverview } from "@/lib/hooks/data/overview";
import { View } from "react-native";

export default function OverviewScreen() {
  // overview data
  const { data } = useOverview();

  // screen
  return (
    <View className="flex flex-col gap-2">
      {/* main grid */}
      <View className="grid grid-cols-2"></View>
    </View>
  );
}

// overview card
const OverviewCard = () => {
  return <Card></Card>;
};
