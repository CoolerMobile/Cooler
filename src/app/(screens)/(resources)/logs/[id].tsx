import BottomSheet from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { type ResourceLogRequestTrace, useCoolifyResourceLogs } from "@/lib/hooks/data/coolify-logs"
import { useScreenOptions } from "@/lib/hooks/screen-options"
import type { ResourceLogsRouteParams } from "@/lib/types/coolify"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Stack, useIsFocused, useLocalSearchParams } from "expo-router"
import { CircleCheck, CircleX, Clock3, Info, RefreshCw } from "lucide-react-native"
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
  updatedAt === null ? "Not loaded" : `Checked ${dayjs(updatedAt).fromNow()}`

const cooldownRemaining = (blockedUntil: number, now: number): string => {
  const seconds = Math.max(0, Math.ceil((blockedUntil - now) / 1_000))
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.ceil(seconds / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.ceil(minutes / 60)}h`
}

const requestDuration = (request: ResourceLogRequestTrace, now: number): string => {
  const durationMs = (request.finishedAt ?? now) - request.startedAt
  return `${Math.max(0, durationMs / 1_000).toFixed(request.finishedAt ? 1 : 0)}s`
}

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
  const [logInfoOpen, setLogInfoOpen] = useState(false)
  const [requestDetailsOpen, setRequestDetailsOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const { logs, isLoading, isRefreshing, error, logsUpdatedAt, requests, requestBlockedUntil, refresh } =
    useCoolifyResourceLogs(resource.id, {
      enabled: isFocused,
      selectedSource,
    })
  const selectedLog = logs.find(({ source }) => source === selectedSource) ?? logs[0]
  const hasLogs = Boolean(selectedLog?.content.length)
  const latestEntryAt = latestLogEntry(selectedLog?.content)
  const logScrollRef = useRef<ScrollView>(null)
  const followsLatestLogRef = useRef(true)
  const activeRequest = [...requests].reverse().find(({ state }) => state === "pending")
  const requestElapsedMs = activeRequest ? Math.max(0, now - activeRequest.startedAt) : 0
  const requestRemainingSeconds = activeRequest
    ? Math.max(0, Math.ceil((activeRequest.timeoutMs - requestElapsedMs) / 1_000))
    : 0
  const requestTimeBudgetUsed = activeRequest
    ? Math.min(100, (requestElapsedMs / activeRequest.timeoutMs) * 100)
    : 0
  const requestBlocked = Boolean(requestBlockedUntil && requestBlockedUntil > now)
  const requestCooldownRemaining = requestBlockedUntil ? cooldownRemaining(requestBlockedUntil, now) : null

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

  useEffect(() => {
    if (!activeRequest && !requestBlocked) return

    setNow(Date.now())
    const interval = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (!activeRequest && requestBlockedUntil && current >= requestBlockedUntil) clearInterval(interval)
    }, 1_000)
    return () => clearInterval(interval)
  }, [activeRequest, requestBlocked, requestBlockedUntil])

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
          headerRight: () => (
            <Button
              variant="ghost"
              size="icon"
              accessibilityLabel="Show how runtime logs work"
              onPress={() => setLogInfoOpen(true)}>
              <Icon as={Info} size={19} />
            </Button>
          ),
        })}
      />

      {/* logs */}
      <View className="flex-1 gap-2 px-6 pb-14 pt-4">
        <View className="gap-2 py-2">
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 shrink flex-row items-center gap-2">
              <View
                className={`size-1.5 rounded-full ${
                  error ? "bg-destructive" : logsUpdatedAt === null ? "bg-muted-foreground" : "bg-emerald-500"
                }`}
              />
              <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">
                {logsUpdatedAt === null
                  ? "Logs not loaded"
                  : latestEntryAt === null
                    ? "No timestamped entries"
                    : `Latest log ${dayjs(latestEntryAt).fromNow()}`}
              </Text>
            </View>
          </View>

          {activeRequest ? (
            <View className="gap-1.5">
              <View className="flex-row items-center justify-between gap-3">
                <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {activeRequest.label} · {requestDuration(activeRequest, now)}
                </Text>
                <Text className="text-xs tabular-nums text-muted-foreground">
                  Timeout in {requestRemainingSeconds}s
                </Text>
              </View>
              <View
                className="h-1 overflow-hidden rounded-full bg-muted"
                accessibilityRole="progressbar"
                accessibilityLabel={`${activeRequest.label} timeout budget`}
                accessibilityValue={{ min: 0, max: 100, now: Math.round(requestTimeBudgetUsed) }}>
                <View
                  className="h-full rounded-full bg-teal-600 dark:bg-pink-500"
                  style={{ width: `${requestTimeBudgetUsed}%` }}
                />
              </View>
            </View>
          ) : error ? null : (
            <View className="flex flex-row items-center justify-between">
              <Text numberOfLines={1} className="text-xs text-muted-foreground">
                {requestBlocked && requestCooldownRemaining
                  ? `Refresh available in ${requestCooldownRemaining}`
                  : lastChecked(logsUpdatedAt)}
              </Text>

              <View className="flex-row items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  disabled={isRefreshing || requestBlocked}
                  accessibilityLabel={logsUpdatedAt === null ? "Load runtime logs" : "Refresh runtime logs"}
                  onPress={() => void refresh()}>
                  <Icon as={RefreshCw} size={15} className="text-muted-foreground" />
                  <Text className="text-xs text-muted-foreground">
                    {logsUpdatedAt === null ? "Load" : "Refresh"}
                  </Text>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  accessibilityLabel="Show runtime log request details"
                  onPress={() => setRequestDetailsOpen(true)}>
                  <Icon as={Info} size={15} className="text-muted-foreground" />
                  <Text className="text-xs text-muted-foreground">Requests</Text>
                </Button>
              </View>
            </View>
          )}
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

        {error ? (
          <View className="items-center gap-2 py-1">
            <Text className="text-center text-sm text-destructive">{error}</Text>
            <Text className="text-center text-xs text-muted-foreground">
              Automatic retries are off to protect your server.
            </Text>
            {requestBlocked && requestCooldownRemaining ? (
              <Text className="text-center text-xs text-muted-foreground">
                Further log requests are paused for {requestCooldownRemaining}.
              </Text>
            ) : null}
          </View>
        ) : null}

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
                {error
                  ? "Logs could not be loaded."
                  : logsUpdatedAt === null
                    ? requestBlocked
                      ? "Log requests are temporarily paused."
                      : "Preparing the first log snapshot…"
                    : "No logs available."}
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

      <LogInfoSheet open={logInfoOpen} onClose={() => setLogInfoOpen(false)} />
      <RequestDetailsSheet
        now={now}
        open={requestDetailsOpen}
        requests={requests}
        onClose={() => setRequestDetailsOpen(false)}
      />
    </>
  )
}

function LogInfoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet
      key="resource-log-info"
      index={open ? 0 : -1}
      onDismiss={onClose}
      enablePanDownToClose
      snapPoints={["68%"]}>
      <View className="flex-1 gap-4 px-4 pb-5 pt-2">
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-lg font-bold">How logs work</Text>
            <Text className="text-xs text-muted-foreground">What happens when Cooler requests logs</Text>
          </View>
          <Button variant="ghost" size="sm" onPress={onClose}>
            <Text>Done</Text>
          </Button>
        </View>

        <View className="min-h-0 flex-1 pb-4">
          <Card className="gap-4 p-4">
            <View className="flex-row items-start gap-3">
              <View className="size-6 items-center justify-center rounded-full bg-muted">
                <Text className="text-xs font-semibold">1</Text>
              </View>
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-xs font-semibold">One log snapshot</Text>
                <Text className="text-xs leading-5 text-muted-foreground">
                  Cooler sends one guarded request when this screen opens. After that, Refresh is always
                  explicit.
                </Text>
              </View>
            </View>

            <View className="h-px bg-border" />

            <View className="flex-row items-start gap-3">
              <View className="size-6 items-center justify-center rounded-full bg-muted">
                <Text className="text-xs font-semibold">2</Text>
              </View>
              <View className="min-w-0 flex-1 gap-2">
                <Text className="text-xs font-semibold">Coolify contacts Docker</Text>
                <Text className="text-xs leading-5 text-muted-foreground">
                  Coolify finds the running container, checks its state, then runs:
                </Text>
                <View className="rounded-md bg-muted px-3 py-2">
                  <Text selectable className="font-mono text-[11px] text-foreground">
                    docker logs
                  </Text>
                </View>
                <Text className="text-xs leading-5 text-muted-foreground">on the resource server.</Text>
              </View>
            </View>

            <View className="h-px bg-border" />

            <View className="flex-row items-start gap-3">
              <View className="size-6 items-center justify-center rounded-full bg-muted">
                <Text className="text-xs font-semibold">3</Text>
              </View>
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-xs font-semibold">Automatic once, then bounded</Text>
                <Text className="text-xs leading-5 text-muted-foreground">
                  Requests cannot overlap. Uncertain failures pause only log requests for 2m, then 10m, then
                  1h. Your resource keeps running normally. The bar shows timeout budget, not completion
                  progress.
                </Text>
              </View>
            </View>
          </Card>
        </View>
      </View>
    </BottomSheet>
  )
}

function RequestDetailsSheet({
  now,
  open,
  requests,
  onClose,
}: {
  now: number
  open: boolean
  requests: ResourceLogRequestTrace[]
  onClose: () => void
}) {
  return (
    <BottomSheet
      key="resource-log-request-details"
      index={open ? 0 : -1}
      onDismiss={onClose}
      enablePanDownToClose
      snapPoints={["78%"]}>
      <View className="flex-1 gap-4 px-4 pb-5 pt-2">
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-lg font-bold">Request details</Text>
            <Text className="text-xs text-muted-foreground">Up to 20 recent requests</Text>
          </View>
          <Button variant="ghost" size="sm" onPress={onClose}>
            <Text>Done</Text>
          </Button>
        </View>

        <ScrollView
          className="min-h-0 flex-1"
          contentContainerClassName="gap-3 pb-4"
          showsVerticalScrollIndicator>
          {requests.length === 0 ? (
            <View className="items-center gap-2 py-12">
              <Icon as={Clock3} size={24} className="text-muted-foreground" />
              <Text className="text-sm text-muted-foreground">No requests have been made yet.</Text>
            </View>
          ) : (
            [...requests]
              .reverse()
              .map((request) => <RequestTraceCard key={request.id} now={now} request={request} />)
          )}
        </ScrollView>
      </View>
    </BottomSheet>
  )
}

function RequestTraceCard({ now, request }: { now: number; request: ResourceLogRequestTrace }) {
  const pending = request.state === "pending"
  const success = request.state === "success"
  const timeoutSeconds = Math.round(request.timeoutMs / 1_000)

  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-start gap-3">
        <Icon
          as={pending ? Clock3 : success ? CircleCheck : CircleX}
          size={18}
          className={pending ? "text-muted-foreground" : success ? "text-emerald-500" : "text-destructive"}
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row items-center justify-between gap-3">
            <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-semibold">
              {request.label}
            </Text>
            <Text className="text-xs tabular-nums text-muted-foreground">
              {requestDuration(request, now)}
            </Text>
          </View>
          <Text className="text-xs text-muted-foreground">
            {dayjs(request.startedAt).format("HH:mm:ss")} · {timeoutSeconds}s timeout
          </Text>
        </View>
      </View>

      <Text selectable className="font-mono text-[11px] leading-4 text-muted-foreground">
        GET {request.path}
      </Text>

      <View className="border-t border-border pt-3">
        <Text
          className={`text-xs ${request.state === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {pending
            ? "Waiting for Coolify to respond…"
            : `${request.statusCode ? `${request.statusCode} · ` : ""}${request.result ?? (success ? "Completed" : "Failed")}`}
        </Text>
      </View>
    </Card>
  )
}
