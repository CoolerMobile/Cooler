import Spacer from "@/components/custom/spacer"
import { useAppTheme } from "@/components/custom/theme"
import BottomSheet, { BottomSheetTextInput } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Text } from "@/components/ui/text"
import { HealthStatus, useOverview } from "@/lib/hooks/data/overview"
import { useServer } from "@/lib/hooks/servers/connection"
import { Button as NativeButton, Host as NativeHost } from "@expo/ui"
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Component,
  Library,
  LucideIcon,
  Server,
  TriangleAlert,
} from "lucide-react-native"
import { useRef, useState } from "react"
import { Alert, ScrollView, TextInput, useWindowDimensions, View } from "react-native"

const HEALTH_PRESENTATION: Record<
  HealthStatus,
  {
    icon: LucideIcon
    iconClassName: string
    iconContainerClassName: string
    description: string
  }
> = {
  [HealthStatus.HEALTHY]: {
    icon: CircleCheck,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    iconContainerClassName: "bg-emerald-500/10",
    description: "Everything being monitored is running normally.",
  },
  [HealthStatus.DEGRADED]: {
    icon: TriangleAlert,
    iconClassName: "text-amber-600 dark:text-amber-400",
    iconContainerClassName: "bg-amber-500/10",
    description: "A non-critical resource needs your attention.",
  },
  [HealthStatus.UNHEALTHY]: {
    icon: CircleAlert,
    iconClassName: "text-red-600 dark:text-red-400",
    iconContainerClassName: "bg-red-500/10",
    description: "A critical resource is stopped, failing, or unreachable.",
  },
  [HealthStatus.UNKNOWN]: {
    icon: CircleHelp,
    iconClassName: "text-muted-foreground",
    iconContainerClassName: "bg-muted",
    description: "There is not enough resource data to determine health yet.",
  },
}

export default function OverviewScreen() {
  const { height: windowHeight } = useWindowDimensions()
  const { colorScheme } = useAppTheme()
  const nativeAccentColor = colorScheme === "dark" ? "#e91e63" : "#008080"
  const newServerSheetHeight = windowHeight * 0.56

  const overviewData = useOverview()
  const health = HEALTH_PRESENTATION[overviewData.healthStatus]

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

  const { validate, create } = useServer()
  const [validating, setValidating] = useState(false)
  const resetNewServerForm = () => {
    setNewServerOpen(false)
    setNewServerNickValue("")
    setNewServerAddressValue("")
    setNewServerApiKeyValue("")
    newServerNick.current?.clear()
    newServerAddress.current?.clear()
    newServerApiKey.current?.clear()
  }

  const addServer = async () => {
    try {
      const created = await create({
        nickname: newServerNickValue.trim(),
        endpoint: newServerAddressValue.trim(),
        token: newServerApiKeyValue.trim(),
      })

      if (!created) throw Error("server could not be added")
      resetNewServerForm()
    } catch (error) {
      Alert.alert("Server Could Not Be Added", error instanceof Error ? error.message : "Please try again.", [
        {
          text: "Go Back",
          style: "cancel",
        },
        {
          text: "Try Again",
          onPress: addServer,
        },
      ])
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
                text: "Edit Details",
                style: "cancel",
              },
              {
                text: "Add Server",
                onPress: addServer,
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

  return (
    <>
      <View className="flex-1 gap-8 p-4">
        <View
          accessible
          accessibilityLabel={`Status: ${overviewData.healthStatus}. ${health.description}`}
          className="gap-5 rounded-2xl border border-border bg-card p-5">
          <View className="flex-row items-center gap-4">
            <View
              className={`h-12 w-12 shrink-0 items-center justify-center rounded-full ${health.iconContainerClassName}`}>
              <Icon as={health.icon} size={24} className={health.iconClassName} />
            </View>

            <View className="flex-1 gap-1">
              <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Status
              </Text>
              <Text className="text-2xl font-bold">{overviewData.healthStatus}</Text>
              <Text className="leading-5 text-muted-foreground">{health.description}</Text>
            </View>
          </View>

          <View className="flex-row border-t border-border pt-4">
            <StatusFact label="Servers" value={overviewData.serverCount} />
            <View className="w-hairline mx-4 bg-border" />
            <StatusFact label="Monitored resources" value={overviewData.resourceCount} />
          </View>
        </View>

        <View className="gap-3">
          <View className="gap-1 px-1">
            <Text className="text-xl font-semibold">Infrastructure</Text>
            <Text className="text-sm text-muted-foreground">What Cooler can currently see</Text>
          </View>

          <View className="overflow-hidden rounded-2xl border border-border bg-card">
            <OverviewRow
              icon={Server}
              title="Servers"
              description="Coolify connections"
              count={overviewData.serverCount}
            />
            <Separator />
            <OverviewRow
              icon={Component}
              title="Instances"
              description="Deployment targets"
              count={overviewData.instanceCount}
            />
            <Separator />
            <OverviewRow
              icon={Library}
              title="Resources"
              description="Apps, databases, and services"
              count={overviewData.resourceCount}
            />
          </View>
        </View>
      </View>

      <BottomSheet
        key="new-server-sheet"
        index={newServerOpen ? 0 : -1}
        onDismiss={() => setNewServerOpen(false)}
        enablePanDownToClose
        snapPoints={["68%"]}>
        <View
          className="gap-5 p-4"
          style={{
            height: newServerSheetHeight,
          }}>
          <View className="gap-1">
            <Text className="text-xl font-semibold">Add a server</Text>
            <Text className="text-sm text-muted-foreground">
              Connect Cooler to an existing Coolify server.
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
                onChangeText={setNewServerApiKeyValue}
              />

              <View className="flex-row flex-wrap items-center">
                <Text className="text-xs text-muted-foreground">Grant </Text>
                <Button
                  variant="link"
                  className="h-auto p-0"
                  onPress={() => {
                    Alert.alert(
                      "API key permissions",
                      `Only enable the permissions this key needs.\n\n${apiKeyScopes
                        .map((scope) => `${scope.name} — ${scope.description}`)
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
                label={validating ? "Validating…" : "Validate connection"}
                disabled={!canValidateServer || validating}
                onPress={() => void validateConnection()}
                style={{
                  width: "100%",
                  height: 48,
                }}
              />
            </NativeHost>
          </View>
        </View>
      </BottomSheet>
    </>
  )
}

function StatusFact({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 gap-0.5">
      <Text className="text-2xl font-semibold tabular-nums">{value}</Text>
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  )
}

function OverviewRow({
  icon,
  title,
  description,
  count,
}: {
  icon: LucideIcon
  title: string
  description: string
  count: number
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${title}: ${count}. ${description}`}
      className="min-h-20 flex-row items-center gap-3 px-4 py-3">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon as={icon} size={20} className="text-foreground" />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-semibold">{title}</Text>
        <Text className="text-sm text-muted-foreground">{description}</Text>
      </View>
      <Text className="text-2xl font-semibold tabular-nums">{count}</Text>
    </View>
  )
}
