import Spacer from "@/components/custom/spacer"
import BottomSheet, { BottomSheetTextInput } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Label } from "@/components/ui/label"
import { Text } from "@/components/ui/text"
import { useOverview } from "@/lib/hooks/data/overview"
import { useServer, ServerData } from "@/lib/hooks/servers/connection"
import { Plus, Waypoints } from "lucide-react-native"
import { useRef, useState } from "react"
import { ActivityIndicator, Alert, TextInput, useWindowDimensions, View } from "react-native"

export default function OverviewScreen() {
  const { height: windowHeight } = useWindowDimensions()
  const newServerSheetHeight = windowHeight * 0.5

  // overview data
  const overviewData = useOverview()
  const total = overviewData.instanceCount + overviewData.resourceCount + overviewData.serverCount

  // new server
  const [newServerOpen, setNewServerOpen] = useState(false)
  const newServerNick = useRef<TextInput>(null)
  const newServerAddress = useRef<TextInput>(null)
  const newServerApiKey = useRef<TextInput>(null)
  const [newServerNickValue, setNewServerNickValue] = useState("")
  const [newServerAddressValue, setNewServerAddressValue] = useState("")
  const [newServerApiKeyValue, setNewServerApiKeyValue] = useState("")
  const canValidateServer = [newServerNickValue, newServerAddressValue, newServerApiKeyValue].every(
    (value) => value.trim().length > 0
  )

  // validate connection
  const { validate, create } = useServer()
  const [validating, setValidating] = useState(false)
  const [validationResponse, setValidationResponse] = useState<Omit<ServerData, "id">>()
  const resetNewServerForm = () => {
    setNewServerOpen(false)
    setNewServerNickValue("")
    setNewServerAddressValue("")
    setNewServerApiKeyValue("")
    setValidationResponse(undefined)
    newServerNick.current?.clear()
    newServerAddress.current?.clear()
    newServerApiKey.current?.clear()
  }

  const addServer = async () => {
    try {
      // create server
      const created = await create({
        nickname: newServerNickValue.trim(),
        endpoint: newServerAddressValue.trim(),
        token: newServerApiKeyValue.trim(),
      })

      // failed to create server
      if (!created) throw Error("server could not be added")

      // reset new server form
      resetNewServerForm()
    } catch (error) {
      Alert.alert(
        "Server Could Not Be Added",
        error instanceof Error ? error.message : "Please try again.",
        [
          { text: "Go Back", style: "cancel" },
          { text: "Try Again", onPress: addServer },
        ]
      )
    }
  }

  const validateConnection = async () => {
    // validate input
    if (!canValidateServer) return

    // attempt to validate connection
    setValidating(true)
    try {
      const data = await validate({
        nickname: newServerNickValue.trim(),
        endpoint: newServerAddressValue.trim(),
        token: newServerApiKeyValue.trim(),
      })

      // set validation data
      setValidationResponse(data)

      // alert per response type
      const { health, version } = data
      const allGood = health === "ok" && Boolean(version)
      Alert.alert(
        `Validation ${allGood ? "Succeeded" : "Failed"}`,
        allGood ? `This server is running Coolify v${version}.` : "Would you like to try again?",
        allGood
          ? [
              { text: "Edit Details", style: "cancel" },
              { text: "Add Server", onPress: addServer },
            ]
          : [
              { text: "Go Back", style: "cancel" },
              { text: "Try Again", onPress: validateConnection },
            ]
      )
    } catch (error) {
      Alert.alert(
        "Validation Failed",
        error instanceof Error ? error.message : "Would you like to try again?",
        [
          { text: "Go Back", style: "cancel" },
          { text: "Try Again", onPress: validateConnection },
        ]
      )
    } finally {
      setValidating(false)
    }
  }

  // api key scopes
  const apiKeyScopes: { name: string; description: string }[] = [
    {
      name: "Root",
      description: "Full access to every operation",
    },
    {
      name: "Write",
      description: "Create and update resources",
    },
    {
      name: "Read",
      description: "Read non-sensitive values",
    },
    {
      name: "Deploy",
      description: "Trigger deployments",
    },
  ]

  // screen
  return (
    <>
      <View className="flex flex-col gap-2">
        {/* main grid */}
        <View className="grid grid-cols-2">
          {/* no data to show */}
          {!total && (
            <View className="h-full w-full items-center justify-center gap-4">
              <Text className="text-center text-lg">You have no Servers</Text>
              <Button size="sm" onPress={() => setNewServerOpen(true)}>
                <Icon as={Plus} />
                <Text>Add Server</Text>
              </Button>
            </View>
          )}
        </View>
      </View>
      <BottomSheet
        key="new-server-sheet"
        index={newServerOpen ? 0 : -1}
        onDismiss={() => setNewServerOpen(false)}
        enablePanDownToClose
        snapPoints={["62%"]}>
        <View
          className="gap-4 p-4"
          style={{
            height: newServerSheetHeight,
          }}>
          <Text className="text-center text-lg font-semibold">New Server</Text>

          {/* form */}
          <View className="flex-1 gap-4">
            {/* nickname */}
            <Label>Nickname</Label>
            <BottomSheetTextInput
              ref={newServerNick}
              className="rounded-md border border-input bg-card px-3 py-4 text-foreground"
              autoCorrect={false}
              placeholder="Leon's Very Cool Server"
              onChangeText={setNewServerNickValue}
            />

            {/* address */}
            <Label>Server Address (No Protocol)</Label>
            <BottomSheetTextInput
              ref={newServerAddress}
              className="rounded-md border border-input bg-card px-3 py-4 text-foreground"
              autoCorrect={false}
              placeholder="server.umbrella.gg"
              onChangeText={setNewServerAddressValue}
            />

            {/* api key */}
            <View className="gap-2">
              {/* input */}
              <Label>API Key</Label>
              <BottomSheetTextInput
                ref={newServerApiKey}
                className="w-full rounded-md border border-input bg-card px-3 py-4 text-foreground"
                autoCorrect={false}
                placeholder="HOPE"
                onChangeText={setNewServerApiKeyValue}
              />

              {/* info */}
              <View className="flex-row flex-wrap items-center justify-center">
                <Text className="text-xs text-muted-foreground">Set your key access to </Text>
                <Button
                  variant="link"
                  className="h-auto p-0"
                  onPress={() => {
                    Alert.alert(
                      "API Key",
                      `When creating your API key, ensure to enable only the scopes you truly need.\n\nHere are the scopes, for reference:\n\n${apiKeyScopes
                        .map((scope) => `${scope.name} - ${scope.description}`)
                        .join("\n")}`
                    )
                  }}>
                  <Text className="text-xs font-semibold underline">only what you need</Text>
                </Button>
                <Text className="text-xs text-muted-foreground">.</Text>
              </View>
            </View>

            <Spacer />

            {/* validate connection */}
            <Button disabled={!canValidateServer || validating} onPress={validateConnection}>
              {validating ? <ActivityIndicator /> : <Icon as={Waypoints} />}
              <Text>{validating ? "Validating..." : "Validate Connection"}</Text>
            </Button>
          </View>
        </View>
      </BottomSheet>
    </>
  )
}

// overview card
const OverviewCard = () => {
  return <Card></Card>
}
