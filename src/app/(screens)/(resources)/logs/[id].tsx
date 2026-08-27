import { Text } from "@/components/ui/text"
import { useCoolifyResourceLogs } from "@/lib/hooks/data/coolify"
import { useScreenOptions } from "@/lib/hooks/screen-options"
import type { ResourceLogsRouteParams } from "@/lib/types/coolify"
import { Stack, useLocalSearchParams } from "expo-router"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { ActivityIndicator, ScrollView, View } from "react-native"
import { Card } from "@/components/ui/card"

// time since last update
dayjs.extend(relativeTime)

const lastUpdated = (updatedAt: number | null): string =>
  updatedAt === null ? "Not updated yet" : `Last updated ${dayjs(updatedAt).fromNow()}`

export default function ResourceLogs() {
  // resource
  const resource = useLocalSearchParams<ResourceLogsRouteParams>()
  const { logs, isLoading, error, logsUpdatedAt } = useCoolifyResourceLogs(resource.id)
  const hasLogs = logs.some(({ content }) => content.length > 0)

  // screen options
  const { options } = useScreenOptions()

  // screen
  return (
    <>
      <Stack.Screen
        options={options({
          title: "Logs",
        })}
      />

      {/* logs */}
      <View className="flex-1 gap-2 px-6 pb-14 pt-4">
        <Text className="p-2 text-center text-xs text-muted-foreground">{lastUpdated(logsUpdatedAt)}</Text>

        {error ? <Text className="text-center text-sm text-destructive">{error}</Text> : null}

        <Card className="min-h-0 flex-1 overflow-hidden py-0">
          {isLoading ? (
            <View className="flex-1 items-center justify-center gap-3 p-6">
              <ActivityIndicator />
              <Text className="text-sm text-muted-foreground">Loading logs…</Text>
            </View>
          ) : !hasLogs ? (
            <View className="flex-1 items-center justify-center p-6">
              <Text className="text-center text-sm text-muted-foreground">
                {error ? "Logs could not be loaded." : "No logs available."}
              </Text>
            </View>
          ) : (
            <ScrollView
              alwaysBounceVertical={false}
              contentContainerClassName="gap-6 p-4"
              showsVerticalScrollIndicator>
              {logs.map((log) => (
                <View key={log.source} className="gap-2">
                  {logs.length > 1 ? (
                    <Text className="text-xs font-semibold text-muted-foreground">{log.source}</Text>
                  ) : null}
                  <Text selectable className="font-mono text-xs">
                    {log.content || "No logs available for this container."}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </Card>
      </View>
    </>
  )
}
