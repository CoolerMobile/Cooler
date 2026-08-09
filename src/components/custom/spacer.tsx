import { cn } from "@/lib/utils";
import { View } from "react-native";

type SpacerOrientation = "vertical" | "horizontal";

/**
 * if space is not provided, it will take as much remaining space as possible
 *
 * @param orientation whether to apply spacing vertically or horizontally
 * @param space spacer size in pixels
 * @returns a div that separates content
 */
export default function Spacer({
  space,
  orientation = "vertical",
  className,
}: {
  space?: number;
  orientation?: SpacerOrientation;
  className?: string;
}) {
  const sizeStyle =
    space == null
      ? undefined
      : orientation === "vertical"
        ? { height: space }
        : { width: space };

  // Fill only the remaining space within the parent (including its safe-area bounds).
  const fillClass = "flex-1";

  return (
    <View
      className={cn(space != null ? "shrink-0" : fillClass, className)}
      style={sizeStyle}
    />
  );
}
