import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

const settingsItemVariants = cva(
  "flex-row items-center gap-3 rounded-lg px-4 py-3",
  {
    variants: {
      variant: {
        default: "active:bg-accent",
        secondary: "bg-secondary active:bg-secondary/80",
        destructive: "bg-destructive active:bg-destructive/90",
        ghost: "active:bg-accent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const settingsItemIconVariants = cva(
  "items-center justify-center rounded-md p-2",
  {
    variants: {
      variant: {
        default: "bg-secondary",
        secondary: "bg-secondary-foreground/10",
        destructive: "bg-destructive-foreground/20",
        ghost: "bg-secondary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const settingsItemForegroundVariants = cva("", {
  variants: {
    variant: {
      default: "text-foreground",
      secondary: "text-secondary-foreground",
      destructive: "text-destructive-foreground",
      ghost: "text-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const settingsItemDescriptionVariants = cva("text-sm", {
  variants: {
    variant: {
      default: "text-muted-foreground",
      secondary: "text-secondary-foreground/70",
      destructive: "text-destructive-foreground/80",
      ghost: "text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

type SettingsItemProps = {
  variant?: "default" | "secondary" | "destructive" | "ghost";
  title: string;
  description: string;
  icon: LucideIcon;
  action: () => void;
  actionIcon?: LucideIcon;
};

export const SettingsItem = ({
  variant,
  title,
  description,
  icon,
  action,
  actionIcon,
}: SettingsItemProps) => {
  return (
    <Pressable
      onPress={action}
      accessibilityRole="button"
      className={settingsItemVariants({ variant })}
    >
      <View className={settingsItemIconVariants({ variant })}>
        <Icon
          as={icon}
          className={settingsItemForegroundVariants({ variant })}
          size={20}
        />
      </View>
      <View className="flex-1 gap-0.5">
        <Text
          className={cn(
            "font-medium",
            settingsItemForegroundVariants({ variant }),
          )}
        >
          {title}
        </Text>
        <Text className={settingsItemDescriptionVariants({ variant })}>
          {description}
        </Text>
      </View>
      <Icon
        as={actionIcon ?? ChevronRight}
        className={settingsItemDescriptionVariants({ variant })}
        size={20}
      />
    </Pressable>
  );
};
