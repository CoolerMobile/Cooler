import { TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { cssInterop } from "nativewind";
import * as React from "react";
import type { SimpleIcon } from "simple-icons";
import Svg, { Path, type SvgProps } from "react-native-svg";

type BrandIconProps = {
  icon: SimpleIcon;
  size?: number;
  color?: string;
  className?: string;
  style?: SvgProps["style"];
};

function BrandIconImpl({ icon, size = 24, color, style }: BrandIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityLabel={icon.title}
      style={style}
    >
      <Path d={icon.path} fill={color} />
    </Svg>
  );
}

cssInterop(BrandIconImpl, {
  className: {
    target: "style",
    nativeStyleToProp: {
      color: true,
      height: "size",
      width: "size",
    },
  },
});

export function BrandIcon({
  className,
  size = 24,
  ...props
}: BrandIconProps) {
  const textClass = React.useContext(TextClassContext);
  return (
    <BrandIconImpl
      className={cn("text-foreground", textClass, className)}
      size={size}
      {...props}
    />
  );
}
