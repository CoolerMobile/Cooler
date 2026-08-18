import { Button } from "@/components/ui/button";
import { BrandIcon } from "@/components/custom/brand-icon";
import { siGithub } from "simple-icons";
import BottomSheet from "@expo/ui/community/bottom-sheet";
import * as Linking from "expo-linking";
import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import Spacer from "@/components/custom/spacer";

export const SettingsGitHub = () => {
  const [sourceOpen, setSourceOpen] = useState(false);

  // github button
  return (
    <>
      <Button variant="ghost" onPress={() => setSourceOpen(true)}>
        <BrandIcon icon={siGithub} />
      </Button>
      {/* source code sheet */}
      <BottomSheet
        key="source-code-sheet"
        index={sourceOpen ? 0 : -1}
        onDismiss={() => setSourceOpen(false)}
        enablePanDownToClose
        snapPoints={["42%"]}
      >
        <View className="gap-4 p-4">
          <Text className="font-semibold text-lg text-center">Source Code</Text>
          <Text className="text-muted-foreground">
            The app is{" "}
            <Text className="font-semibold">completely open-source</Text>, so
            you can read the code in its entirety on our GitHub repository.
          </Text>
          <Text className="text-muted-foreground">
            Your data is never distributed, sold, or otherwise shared with any
            third-party entities. Every single bit of your data is handled{" "}
            <Text className="font-semibold">100% on-device</Text>.
          </Text>

          <Text className="text-muted-foreground">
            This means that, aside from error reporting data, which does{" "}
            <Text className="font-semibold">not</Text> include any of your own
            data, and is completely anonymised pre-flight,{" "}
            <Text className="font-semibold">
              nothing ever leaves your device
            </Text>
            .
          </Text>

          <Spacer />

          <Button
            className="items-center"
            onPress={async () =>
              await Linking.openURL("https://github.com/CoolerMobile/Cooler")
            }
          >
            <BrandIcon icon={siGithub} />
            <Text>View Cooler on GitHub</Text>
          </Button>
        </View>
      </BottomSheet>
    </>
  );
};
