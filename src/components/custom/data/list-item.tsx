import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ChevronRight, CircleQuestionMark } from "lucide-react-native";
import { ReactElement } from "react";
import { Pressable, View } from "react-native";
import Spacer from "../spacer";

type ListItemProps = {
  className?: string;
  title?: string;
  description?: string;
  leading?: ReactElement;
  trailing?: ReactElement;
  onPress?: () => void;
};

export const ListItem = ({
  className,
  title = "No Title",
  description,
  leading = <Icon as={CircleQuestionMark} size={24} />,
  trailing = <Icon as={ChevronRight} />,
  onPress,
}: ListItemProps) => {
  return (
    <Pressable onPress={onPress} className={cn("my-2", className)}>
      <Card className="p-0">
        <CardContent>
          <View className="flex flex-row items-center py-5">
            {/* leading */}
            <View className="p-0">{leading}</View>

            {/* title and description */}
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>

            <Spacer />

            {/* trailing */}
            <View className="p-0">{trailing}</View>
          </View>
        </CardContent>
      </Card>
    </Pressable>
  );
};
