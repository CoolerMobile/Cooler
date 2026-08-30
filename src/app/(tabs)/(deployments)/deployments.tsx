import { DeploymentStatusIcon, StatusBadge } from "@/components/custom/deployments/status"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { deploymentDuration, deploymentStages, shortCommit } from "@/lib/deployments/presentation"
import { cancelDeployment, deploymentErrorMessage, refreshDeployments } from "@/lib/hooks/data/deployments"
import { useNotifications } from "@/lib/hooks/notifications"
import { useDataStore } from "@/lib/stores/data"
import { useDeploymentStore } from "@/lib/stores/deployments"
import { registerDeploymentBackgroundTask } from "@/lib/tasks/deployment-monitor"
import type { Deployment, DeploymentFilters, DeploymentStatusFilter } from "@/lib/types/deployment"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { router, useFocusEffect } from "expo-router"
import {
  Bell,
  BellRing,
  ChevronRight,
  Filter,
  PackageOpen,
  Search,
  Server,
  SlidersHorizontal,
  X,
} from "lucide-react-native"
import { useCallback, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native"

dayjs.extend(relativeTime)

let deploymentsScrollOffset = 0

const STATUS_FILTERS: { value: DeploymentStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "failed", label: "Failed" },
  { value: "success", label: "Success" },
]

const isActive = (deployment: Deployment) => ["queued", "running"].includes(deployment.status)

const openDeployment = (deployment: Deployment) => {
  router.push({ pathname: "/(screens)/deployments/[id]", params: { id: deployment.id } })
}

export default function DeploymentsScreen() {
  const scrollRef = useRef<ScrollView>(null)
  const deployments = useDeploymentStore((state) => state.deployments)
  const filters = useDeploymentStore((state) => state.filters)
  const setFilters = useDeploymentStore((state) => state.setFilters)
  const watchedDeploymentIds = useDeploymentStore((state) => state.watchedDeploymentIds)
  const watchDeployment = useDeploymentStore((state) => state.watchDeployment)
  const unwatchDeployment = useDeploymentStore((state) => state.unwatchDeployment)
  const isLoading = useDeploymentStore((state) => state.isLoading)
  const isRefreshing = useDeploymentStore((state) => state.isRefreshing)
  const error = useDeploymentStore((state) => state.error)
  const servers = useDataStore((state) => state.servers)
  const { enableLocalNotifications } = useNotifications()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [notificationBusyId, setNotificationBusyId] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ y: deploymentsScrollOffset, animated: false })
      )
      return () => cancelAnimationFrame(frame)
    }, [])
  )

  const activeDeployments = useMemo(() => deployments.filter(isActive), [deployments])
  const history = useMemo(
    () =>
      deployments.filter((deployment) => {
        if (isActive(deployment)) return false
        if (filters.status !== "all" && deployment.status !== filters.status) return false
        if (filters.server && deployment.serverName !== filters.server) return false
        if (filters.project && deployment.projectName !== filters.project) return false
        if (filters.resource && deployment.resourceName !== filters.resource) return false
        const query = filters.query.trim().toLowerCase()
        if (!query) return true
        return [
          deployment.resourceName,
          deployment.projectName,
          deployment.environmentName,
          deployment.serverName,
          deployment.commit,
          deployment.commitMessage,
        ].some((value) => value?.toLowerCase().includes(query))
      }),
    [deployments, filters]
  )
  const groupedHistory = useMemo(() => groupDeployments(history), [history])
  const activeFilterCount = [filters.server, filters.project, filters.resource].filter(Boolean).length

  const toggleNotification = async (deployment: Deployment) => {
    if (watchedDeploymentIds.includes(deployment.id)) {
      unwatchDeployment(deployment.id)
      return
    }
    setNotificationBusyId(deployment.id)
    try {
      const notificationsEnabled = await enableLocalNotifications()
      if (!notificationsEnabled) {
        Alert.alert(
          "Notifications are off",
          "Allow notifications in system settings to be notified when this deployment finishes."
        )
        return
      }
      watchDeployment(deployment.id)
      try {
        await registerDeploymentBackgroundTask()
      } catch (backgroundError) {
        unwatchDeployment(deployment.id)
        throw backgroundError
      }
    } catch (notificationError) {
      Alert.alert(
        "Notifications unavailable",
        notificationError instanceof Error
          ? notificationError.message
          : "Please try again on a physical device."
      )
    } finally {
      setNotificationBusyId(null)
    }
  }

  const confirmCancel = (deployment: Deployment) => {
    Alert.alert(
      "Cancel deployment?",
      `${deployment.resourceName} may be left on its currently deployed version.`,
      [
        { text: "Keep running", style: "cancel" },
        {
          text: "Cancel deployment",
          style: "destructive",
          onPress: () =>
            void cancelDeployment(deployment).catch((actionError) =>
              Alert.alert("Could not cancel deployment", deploymentErrorMessage(actionError))
            ),
        },
      ]
    )
  }

  return (
    <View className="flex-1 bg-background">
      <View className="gap-3 px-4 pb-4 pt-2">
        <View className="flex-row items-center gap-2">
          <View className="h-11 flex-1 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Icon as={Search} size={18} className="text-muted-foreground" />
            <TextInput
              accessibilityLabel="Search deployments"
              autoCapitalize="none"
              autoCorrect={false}
              className="h-full flex-1 pb-3 pt-2 text-base text-foreground"
              onChangeText={(query) => setFilters({ query })}
              placeholder="Search deployments"
              placeholderTextColor="#7a7a7a"
              value={filters.query}
            />
            {filters.query ? (
              <Pressable
                accessibilityLabel="Clear search"
                hitSlop={10}
                onPress={() => setFilters({ query: "" })}>
                <Icon as={X} size={17} className="text-muted-foreground" />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={`Filters${activeFilterCount ? `, ${activeFilterCount} active` : ""}`}
            className={`h-11 flex-row items-center gap-1.5 rounded-xl border px-3 ${activeFilterCount ? "border-teal-600 bg-teal-500/10 dark:border-pink-500 dark:bg-pink-500/10" : "border-border bg-card"}`}
            onPress={() => setFiltersOpen(true)}>
            <Icon as={SlidersHorizontal} size={18} />
            {activeFilterCount ? <Text className="text-xs font-bold">{activeFilterCount}</Text> : null}
          </Pressable>
        </View>

        <ScrollView
          horizontal
          contentContainerClassName="flex-grow justify-center gap-2"
          showsHorizontalScrollIndicator={false}
          alwaysBounceHorizontal={false}>
          {STATUS_FILTERS.map((item) => {
            const selected = filters.status === item.value
            return (
              <Pressable
                key={item.value}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                className={`rounded-full border px-4 py-2 ${selected ? "border-foreground bg-foreground" : "border-border bg-card"}`}
                onPress={() => setFilters({ status: item.value })}>
                <Text className={`text-sm font-medium ${selected ? "text-background" : "text-foreground"}`}>
                  {item.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        keyboardDismissMode="on-drag"
        onScroll={({ nativeEvent }) => {
          deploymentsScrollOffset = nativeEvent.contentOffset.y
        }}
        scrollEventThrottle={50}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void refreshDeployments({ showRefreshIndicator: true })}
          />
        }
        contentContainerClassName="gap-6 px-4 pb-32">
        {activeDeployments.length > 0 ? (
          <ActiveDeployments
            deployments={activeDeployments}
            watchedDeploymentIds={watchedDeploymentIds}
            notificationBusyId={notificationBusyId}
            onOpen={openDeployment}
            onCancel={confirmCancel}
            onToggleNotification={(deployment) => void toggleNotification(deployment)}
          />
        ) : null}

        {error ? (
          <View className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <Text className="text-sm text-amber-800 dark:text-amber-200">{error}</Text>
          </View>
        ) : null}

        {isLoading && deployments.length === 0 ? (
          <View className="items-center gap-3 py-20">
            <ActivityIndicator />
            <Text className="text-sm text-muted-foreground">Loading deployments…</Text>
          </View>
        ) : groupedHistory.length > 0 ? (
          <View className="gap-7">
            {groupedHistory.map((group) => (
              <View key={group.label} className="gap-2">
                <Text className="px-1 text-sm font-semibold text-muted-foreground">{group.label}</Text>
                <View className="overflow-hidden rounded-2xl border border-border bg-card">
                  {group.deployments.map((deployment, index) => (
                    <HistoryRow
                      key={deployment.id}
                      deployment={deployment}
                      first={index === 0}
                      onPress={() => openDeployment(deployment)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyDeployments hasServers={servers.length > 0} hasFilters={hasAnyFilter(filters)} />
        )}
      </ScrollView>
      <DeploymentFiltersModal open={filtersOpen} onClose={() => setFiltersOpen(false)} />
    </View>
  )
}

function ActiveDeployments({
  deployments,
  watchedDeploymentIds,
  notificationBusyId,
  onOpen,
  onCancel,
  onToggleNotification,
}: {
  deployments: Deployment[]
  watchedDeploymentIds: string[]
  notificationBusyId: string | null
  onOpen: (deployment: Deployment) => void
  onCancel: (deployment: Deployment) => void
  onToggleNotification: (deployment: Deployment) => void
}) {
  const { width } = useWindowDimensions()
  const cardWidth = deployments.length === 1 ? width - 32 : Math.min(width - 54, 370)
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between px-1">
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-teal-600 dark:bg-pink-500" />
          <Text className="text-sm font-semibold uppercase tracking-wider">
            {deployments.length === 1 ? "Active deployment" : `${deployments.length} active deployments`}
          </Text>
        </View>
        {deployments.length > 1 ? <Text className="text-xs text-muted-foreground">Swipe</Text> : null}
      </View>
      <ScrollView
        horizontal
        decelerationRate="fast"
        snapToInterval={cardWidth + 12}
        contentContainerClassName="gap-3"
        showsHorizontalScrollIndicator={false}>
        {deployments.map((deployment) => {
          const stages = deploymentStages(deployment)
          const foundStageIndex = stages.findIndex((stage) => stage.status === "current")
          const stageIndex = Math.max(0, foundStageIndex)
          const progress =
            deployment.status === "queued" ? 8 : Math.round(((stageIndex + 0.5) / stages.length) * 100)
          const watched = watchedDeploymentIds.includes(deployment.id)
          return (
            <View
              key={deployment.id}
              style={{ width: cardWidth }}
              className="gap-4 rounded-2xl border border-teal-600/40 bg-teal-500/5 p-4 dark:border-pink-500/40 dark:bg-pink-500/5">
              <Pressable className="gap-3" onPress={() => onOpen(deployment)}>
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1 gap-1">
                    <Text numberOfLines={1} className="text-lg font-bold">
                      {deployment.resourceName}
                    </Text>
                    <Text numberOfLines={1} className="text-sm text-muted-foreground">
                      {[deployment.environmentName, deployment.serverName].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <StatusBadge status={deployment.status} />
                </View>
                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <DeploymentStatusIcon status={deployment.status} />
                      <Text className="font-semibold">{stages[stageIndex]?.name ?? "Starting"}</Text>
                    </View>
                    <Text className="text-sm font-semibold tabular-nums">{progress}%</Text>
                  </View>
                  <View className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <View
                      style={{ width: `${progress}%` }}
                      className="h-full rounded-full bg-teal-600 dark:bg-pink-500"
                    />
                  </View>
                  <Text className="text-xs text-muted-foreground">
                    Running for {deploymentDuration(deployment)}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: watched, busy: notificationBusyId === deployment.id }}
                className={`h-11 flex-row items-center justify-center gap-2 rounded-xl border ${watched ? "border-teal-600 bg-teal-500/10 dark:border-pink-500 dark:bg-pink-500/10" : "border-border bg-card"}`}
                disabled={notificationBusyId === deployment.id}
                onPress={() => onToggleNotification(deployment)}>
                {notificationBusyId === deployment.id ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Icon as={watched ? BellRing : Bell} size={18} />
                )}
                <Text className="text-sm font-semibold">
                  {watched ? "Notification set" : "Notify me when finished"}
                </Text>
              </Pressable>
              <View className="flex-row gap-2">
                <Button className="flex-1" variant="outline" onPress={() => onOpen(deployment)}>
                  <Text>View live logs</Text>
                </Button>
                <Button variant="ghost" onPress={() => onCancel(deployment)}>
                  <Text className="text-destructive">Cancel</Text>
                </Button>
              </View>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

function HistoryRow({
  deployment,
  first,
  onPress,
}: {
  deployment: Deployment
  first: boolean
  onPress: () => void
}) {
  const failed = deployment.status === "failed"
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${deployment.resourceName}, ${deployment.status}`}
      className={`relative flex-row items-center gap-3 px-4 py-4 active:bg-muted ${first ? "" : "border-t border-border"} ${failed ? "bg-red-500/5" : ""}`}
      onPress={onPress}>
      {failed ? <View className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-red-500" /> : null}
      <DeploymentStatusIcon status={deployment.status} size={20} />
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text numberOfLines={1} className="min-w-0 flex-1 font-semibold">
            {deployment.resourceName}
          </Text>
          <Text
            className={`text-xs font-bold uppercase ${failed ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
            {deployment.status}
          </Text>
        </View>
        <Text numberOfLines={1} className="text-sm text-muted-foreground">
          {[deployment.environmentName, deployment.serverName].filter(Boolean).join(" · ")}
        </Text>
        <Text numberOfLines={1} className="text-sm text-muted-foreground">
          {shortCommit(deployment.commit)}
          {deployment.commitMessage ? `  ${deployment.commitMessage}` : ""}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {deploymentDuration(deployment)} · {dayjs(deployment.createdAt).fromNow()}
        </Text>
      </View>
      <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
    </Pressable>
  )
}

function EmptyDeployments({ hasServers, hasFilters }: { hasServers: boolean; hasFilters: boolean }) {
  return (
    <View className="items-center gap-3 px-8 py-16">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Icon as={hasServers ? PackageOpen : Server} size={26} className="text-muted-foreground" />
      </View>
      <Text className="text-lg font-semibold">
        {hasFilters
          ? "No matching deployments"
          : hasServers
            ? "No deployments yet"
            : "Connect a Coolify server"}
      </Text>
      <Text className="text-center text-sm leading-5 text-muted-foreground">
        {hasFilters
          ? "Try changing your search or filters."
          : hasServers
            ? "Deployment history will appear here after an application has been deployed."
            : "Add a server from the Overview tab to see active deployments and history."}
      </Text>
    </View>
  )
}

function DeploymentFiltersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const deployments = useDeploymentStore((state) => state.deployments)
  const filters = useDeploymentStore((state) => state.filters)
  const setFilters = useDeploymentStore((state) => state.setFilters)
  const options = {
    server: unique(deployments.map((deployment) => deployment.serverName)),
    project: unique(deployments.map((deployment) => deployment.projectName)),
    resource: unique(deployments.map((deployment) => deployment.resourceName)),
  }
  return (
    <BottomSheet
      key="deployment-filter-sheet"
      index={open ? 0 : -1}
      onDismiss={onClose}
      enablePanDownToClose
      snapPoints={["60%"]}>
      <View className="flex-1 gap-5 px-5 pb-6 pt-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Icon as={Filter} size={20} />
            <Text className="text-xl font-bold">Filters</Text>
          </View>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setFilters({ server: null, project: null, resource: null })}>
            <Text>Reset</Text>
          </Button>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 pb-2"
          alwaysBounceVertical={false}
          showsVerticalScrollIndicator={false}>
          <FilterSection
            label="Server"
            options={options.server}
            selected={filters.server}
            onSelect={(server) => setFilters({ server })}
          />
          <FilterSection
            label="Project"
            options={options.project}
            selected={filters.project}
            onSelect={(project) => setFilters({ project })}
          />
          <FilterSection
            label="Resource"
            options={options.resource}
            selected={filters.resource}
            onSelect={(resource) => setFilters({ resource })}
          />
        </ScrollView>
      </View>
    </BottomSheet>
  )
}

function FilterSection({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string
  options: string[]
  selected: string | null
  onSelect: (value: string | null) => void
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        <FilterPill label="Any" selected={selected === null} onPress={() => onSelect(null)} />
        {options.map((option) => (
          <FilterPill
            key={option}
            label={option}
            selected={selected === option}
            onPress={() => onSelect(option)}
          />
        ))}
      </View>
    </View>
  )
}

function FilterPill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      className={`rounded-full border px-3 py-2 ${selected ? "border-foreground bg-foreground" : "border-border"}`}
      onPress={onPress}>
      <Text className={`text-sm ${selected ? "text-background" : "text-foreground"}`}>{label}</Text>
    </Pressable>
  )
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort()
}

function hasAnyFilter(filters: DeploymentFilters): boolean {
  return Boolean(
    filters.query || filters.status !== "all" || filters.server || filters.project || filters.resource
  )
}

function groupDeployments(deployments: Deployment[]): { label: string; deployments: Deployment[] }[] {
  const groups = new Map<string, Deployment[]>()
  const now = dayjs()
  for (const deployment of deployments) {
    const date = dayjs(deployment.createdAt)
    const label = date.isSame(now, "day")
      ? "Today"
      : date.isSame(now.subtract(1, "day"), "day")
        ? "Yesterday"
        : date.format("MMMM D, YYYY")
    groups.set(label, [...(groups.get(label) ?? []), deployment])
  }
  return [...groups.entries()].map(([label, groupedDeployments]) => ({
    label,
    deployments: groupedDeployments,
  }))
}
