import BottomSheet, { BottomSheetTextInput } from "@/components/ui/bottom-sheet"
import { Text } from "@/components/ui/text"
import { Label } from "@/components/ui/label"
import { Alert, Platform, TextInput, useWindowDimensions, View } from "react-native"
import { useEffect, useRef, useState } from "react"
import { ServerData, useServer } from "@/lib/hooks/servers/connection"
import { Button } from "@/components/ui/button"
import { Button as NativeButton, Host as NativeHost } from "@expo/ui"
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers"
import { useAppTheme } from "@/components/custom/theme"
import Spacer from "@/components/custom/spacer"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: ServerData | null
}

export const NewServerSheet = ({ open, onOpenChange, server }: Props) => {
  const { height: windowHeight } = useWindowDimensions()
  const { colorScheme } = useAppTheme()
  const nativeAccentColor = colorScheme === "dark" ? "#e91e63" : "#008080"
  const newServerSheetHeight = windowHeight * 0.56

  // new server data
  const newServerNick = useRef<TextInput>(null)
  const newServerAddress = useRef<TextInput>(null)
  const newServerApiKey = useRef<TextInput>(null)
  const [newServerNickValue, setNewServerNickValue] = useState("")
  const [newServerAddressValue, setNewServerAddressValue] = useState("")
  const [newServerApiKeyValue, setNewServerApiKeyValue] = useState("")
  const canValidateServer = [newServerNickValue, newServerAddressValue, newServerApiKeyValue].every(
    (value) => value.trim().length > 0
  )
  const isEditing = Boolean(server)

  const { validate, create, update } = useServer()
  const [validating, setValidating] = useState(false)

  useEffect(() => {
    if (!open) return

    setNewServerNickValue(server?.nickname ?? "")
    setNewServerAddressValue(server?.endpoint ?? "")
    setNewServerApiKeyValue(server?.token ?? "")
  }, [open, server])
  const resetNewServerForm = () => {
    onOpenChange(false)
    setNewServerNickValue("")
    setNewServerAddressValue("")
    setNewServerApiKeyValue("")
    newServerNick.current?.clear()
    newServerAddress.current?.clear()
    newServerApiKey.current?.clear()
  }

  const saveServer = async () => {
    try {
      const details = {
        nickname: newServerNickValue.trim(),
        endpoint: newServerAddressValue.trim(),
        token: newServerApiKeyValue.trim(),
      }
      const saved = server ? await update(server.id, details) : await create(details)

      if (!saved) throw Error(server ? "server could not be updated" : "server could not be added")
      resetNewServerForm()
    } catch (error) {
      Alert.alert(
        server ? "Changes Could Not Be Saved" : "Server Could Not Be Added",
        error instanceof Error ? error.message : "Please try again.",
        [
          {
            text: "Go Back",
            style: "cancel",
          },
          {
            text: "Try Again",
            onPress: saveServer,
          },
        ]
      )
    }
  }

  const validateConnection = async () => {
    if (!canValidateServer) return

    setValidating(true)
    try {
      const data = await validate({
        nickname: newServerNickValue.trim(),
        endpoint: newServerAddressValue.trim(),
        token: newServerApiKeyValue.trim(),
      })

      const { health: serverHealth, version } = data
      const allGood = serverHealth === "ok" && Boolean(version)
      Alert.alert(
        `Validation ${allGood ? "Succeeded" : "Failed"}`,
        allGood ? `This server is running Coolify v${version}.` : "Would you like to try again?",
        allGood
          ? [
              {
                text: isEditing ? "Keep Editing" : "Edit Details",
                style: "cancel",
              },
              {
                text: isEditing ? "Save Changes" : "Add Server",
                onPress: saveServer,
              },
            ]
          : [
              {
                text: "Go Back",
                style: "cancel",
              },
              {
                text: "Try Again",
                onPress: validateConnection,
              },
            ]
      )
    } catch (error) {
      Alert.alert(
        "Validation Failed",
        error instanceof Error ? error.message : "Would you like to try again?",
        [
          {
            text: "Go Back",
            style: "cancel",
          },
          {
            text: "Try Again",
            onPress: validateConnection,
          },
        ]
      )
    } finally {
      setValidating(false)
    }
  }

  const apiKeyScopes: {
    name: string
    description: string
  }[] = [
    {
      name: "Root",
      description: "All Cooler features, including logs and deployment actions",
    },
    {
      name: "Read Sensitive",
      description: "View build and runtime logs (also grants Read)",
    },
    {
      name: "Write",
      description: "Create and update resources",
    },
    {
      name: "Read",
      description: "Monitor servers, applications, databases, and services",
    },
    {
      name: "Deploy",
      description: "Trigger deployments",
    },
  ]

  // sheet
  return (
    <BottomSheet
      key="new-server-sheet"
      index={open ? 0 : -1}
      onDismiss={() => onOpenChange(false)}
      enablePanDownToClose
      snapPoints={["68%"]}>
      <View
        className="gap-5 p-4"
        style={{
          height: newServerSheetHeight,
        }}>
        <View className="gap-1">
          <Text className="text-xl font-semibold">{isEditing ? "Edit server details" : "Add a server"}</Text>
          <Text className="text-sm text-muted-foreground">
            {isEditing
              ? "Update the connection details for this Coolify server."
              : "Connect Cooler to an existing Coolify server."}
          </Text>
        </View>

        <View className="flex-1 gap-4">
          <View className="gap-2">
            <Label>Nickname</Label>
            <BottomSheetTextInput
              ref={newServerNick}
              className="rounded-md border border-input bg-card px-3 py-4 text-foreground"
              autoCorrect={false}
              autoCapitalize="words"
              placeholder="Production"
              returnKeyType="next"
              onSubmitEditing={() => newServerAddress.current?.focus()}
              value={newServerNickValue}
              onChangeText={setNewServerNickValue}
            />
          </View>

          <View className="gap-2">
            <Label>Server address</Label>
            <BottomSheetTextInput
              ref={newServerAddress}
              className="rounded-md border border-input bg-card px-3 py-4 text-foreground"
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="url"
              placeholder="server.example.com"
              returnKeyType="next"
              onSubmitEditing={() => newServerApiKey.current?.focus()}
              value={newServerAddressValue}
              onChangeText={setNewServerAddressValue}
            />
            <Text className="text-xs text-muted-foreground">HTTPS is added automatically.</Text>
          </View>

          <View className="gap-2">
            <Label>API key</Label>
            <BottomSheetTextInput
              ref={newServerApiKey}
              className="w-full rounded-md border border-input bg-card px-3 py-4 text-foreground"
              autoCorrect={false}
              autoCapitalize="none"
              secureTextEntry
              placeholder="Enter your API key"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canValidateServer && !validating) void validateConnection()
              }}
              value={newServerApiKeyValue}
              onChangeText={setNewServerApiKeyValue}
            />

            <View className="flex-row flex-wrap items-center">
              <Text className="text-xs text-muted-foreground">Grant </Text>
              <Button
                variant="link"
                className="h-auto p-0"
                onPress={() => {
                  Alert.alert(
                    "API Key Permissions",
                    `Only enable the permissions this key needs.\n\n${apiKeyScopes
                      .map((scope) => `${scope.name} - ${scope.description}`)
                      .join("\n")}`
                  )
                }}>
                <Text className="text-xs font-semibold underline">only the permissions you need</Text>
              </Button>
              <Text className="text-xs text-muted-foreground">.</Text>
            </View>
          </View>

          <Spacer />

          <NativeHost
            colorScheme={colorScheme}
            seedColor={nativeAccentColor}
            matchContents={{
              vertical: true,
            }}
            style={{
              width: "100%",
            }}>
            <NativeButton
              label={validating ? "Validating…" : isEditing ? "Validate changes" : "Validate connection"}
              disabled={!canValidateServer || validating}
              onPress={() => void validateConnection()}
              modifiers={Platform.OS === "android" ? [fillMaxWidth()] : undefined}
              style={{
                width: Platform.OS === "android" ? undefined : "100%",
                height: 48,
              }}
            />
          </NativeHost>
        </View>
      </View>
    </BottomSheet>
  )
}
