import { Card } from "@/components/ui/card"
import { Text } from "@/components/ui/text"
import { useCoolifyResourceLogs } from "@/lib/hooks/data/coolify-logs"
import { useScreenOptions } from "@/lib/hooks/screen-options"
import type { ResourceLogsRouteParams } from "@/lib/types/coolify"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Stack, useIsFocused, useLocalSearchParams } from "expo-router"
import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from "react-native"

dayjs.extend(relativeTime)

const lastChecked = (updatedAt: number | null): string =>
  updatedAt === null ? "Waiting for logs…" : `Checked ${dayjs(updatedAt).fromNow()}`

const latestLogEntry = (content: string | undefined): number | null => {
  if (!content) return null

  const timestamps = content.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g)
  if (!timestamps) return null

  const timestamp = Date.parse(timestamps[timestamps.length - 1])
  return Number.isNaN(timestamp) ? null : timestamp
}

export default function ResourceLogs() {
  // focus
  const isFocused = useIsFocused()

  // resource
  const resource = useLocalSearchParams<ResourceLogsRouteParams>()
  const [selectedSource, setSelectedSource] = useState<string>()
  const { logs, isLoading, isRefreshing, error, logsUpdatedAt } = useCoolifyResourceLogs(resource.id, {
    enabled: isFocused,
    selectedSource,
  })
  const selectedLog = logs.find(({ source }) => source === selectedSource) ?? logs[0]
  const hasLogs = Boolean(selectedLog?.content.length)
  const latestEntryAt = latestLogEntry(selectedLog?.content)
  const logScrollRef = useRef<ScrollView>(null)
  const followsLatestLogRef = useRef(true)

  useEffect(() => {
    if (logs.length === 0) {
      setSelectedSource(undefined)
    } else if (!logs.some(({ source }) => source === selectedSource)) {
      setSelectedSource(logs[0].source)
    }
  }, [logs, selectedSource])

  useEffect(() => {
    followsLatestLogRef.current = true
  }, [selectedLog?.source])

  const updateFollowState = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const distanceFromEnd =
      nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y
    followsLatestLogRef.current = distanceFromEnd < 48
  }

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
        <View className="flex-col items-center justify-between gap-3 py-2">
          <View className="min-w-0 shrink flex-row items-center gap-2">
            <View className={`size-1.5 rounded-full ${error ? "bg-destructive" : "bg-emerald-500"}`} />
            <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">
              {latestEntryAt === null
                ? "No timestamped entries"
                : `Latest log ${dayjs(latestEntryAt).fromNow()}`}
            </Text>
          </View>
          <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {isRefreshing ? "Checking…" : lastChecked(logsUpdatedAt)}
          </Text>
        </View>

        {logs.length > 1 ? (
          <ScrollView
            horizontal
            alwaysBounceHorizontal={false}
            className="max-h-11 grow-0"
            contentContainerClassName="items-center gap-2 px-0.5"
            showsHorizontalScrollIndicator={false}>
            {logs.map(({ source }) => {
              const selected = source === selectedLog?.source

              return (
                <Pressable
                  key={source}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  className={`h-9 max-w-64 flex-row items-center rounded-lg border px-3 active:opacity-70 ${
                    selected ? "border-foreground bg-foreground" : "border-border bg-transparent"
                  }`}
                  onPress={() => {
                    followsLatestLogRef.current = true
                    setSelectedSource(source)
                  }}>
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="middle"
                    className={`shrink text-xs font-medium ${
                      selected ? "text-background" : "text-foreground"
                    }`}>
                    {source}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        ) : null}

        {error ? <Text className="text-center text-sm text-destructive">{error}</Text> : null}

        <Card className="min-h-0 flex-1 overflow-hidden py-0">
          {isLoading || (isRefreshing && !hasLogs) ? (
            <View className="flex-1 items-center justify-center gap-3 p-6">
              <ActivityIndicator />
              <Text className="text-sm text-muted-foreground">
                {selectedLog ? `Loading ${selectedLog.source}…` : "Loading logs…"}
              </Text>
            </View>
          ) : !hasLogs ? (
            <View className="flex-1 items-center justify-center p-6">
              <Text className="text-center text-sm text-muted-foreground">
                {error ? "Logs could not be loaded." : "No logs available."}
              </Text>
            </View>
          ) : (
            <ScrollView
              key={selectedLog?.source}
              ref={logScrollRef}
              alwaysBounceVertical={false}
              contentContainerClassName="p-4"
              onContentSizeChange={() => {
                if (followsLatestLogRef.current) logScrollRef.current?.scrollToEnd({ animated: false })
              }}
              onScroll={updateFollowState}
              scrollEventThrottle={100}
              showsVerticalScrollIndicator>
              <Text selectable className="font-mono text-xs">
                {selectedLog?.content}
              </Text>
            </ScrollView>
          )}
        </Card>
      </View>
    </>
  )
}