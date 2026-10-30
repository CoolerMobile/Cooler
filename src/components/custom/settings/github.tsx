import { Button } from "@/components/ui/button";
import BottomSheet from "@/components/ui/bottom-sheet";
import { BrandIcon } from "@/components/custom/brand-icon";
import { siGithub } from "simple-icons";
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
        snapPoints={["55%"]}
      >
        <View className="gap-4 p-4">
          <Text className="font-semibold text-lg text-center">Source Code</Text>
          <Text className="text-muted-foreground">
            The app is{" "}
            <Text className="font-semibold">completely open-source</Text>, so
            you can read the code in its entirety in its GitHub repository.
          </Text>
          <Text className="text-muted-foreground">
            Your data is never distributed, sold, or otherwise shared with any
            third-party entities. By default, every single bit of your data is
            handled <Text className="font-semibold">100% on-device</Text>.
          </Text>

          <Text className="text-muted-foreground">
            Aside from error reporting data, which does{" "}
            <Text className="font-semibold">not</Text> include any of your own
            data and is completely anonymised pre-flight, nothing leaves your
            device unless you opt in.
          </Text>

          <Text className="text-muted-foreground">
            If you sign into <Text className="font-semibold">CoolerCloud</Text>,
            your push token and Coolify notification events pass through your
            CoolerBridge to deliver push notifications. That integration is
            entirely optional.
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
