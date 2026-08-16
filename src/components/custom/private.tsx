import { PropsWithChildren } from "react";
import { BlurView } from "expo-blur";
import { StyleSheet, View } from "react-native";

type PrivateValueProps = PropsWithChildren<{
  hidden: boolean;
}>;

export const PrivateValue = ({ hidden, children }: PrivateValueProps) => {
  return (
    <View>
      {children}

      {hidden && (
        <BlurView
          intensity={35}
          tint="default"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
};
