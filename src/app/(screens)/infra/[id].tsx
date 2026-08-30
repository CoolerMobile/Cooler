import { DataList } from "@/components/custom/data/list"
import { ListItem } from "@/components/custom/data/list-item"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { MenuView } from "@/components/ui/menu"
import { Text } from "@/components/ui/text"
import { refreshCoolifyData } from "@/lib/hooks/data/coolify"
import { useScreenOptions } from "@/lib/hooks/screen-options"
import { ServerData } from "@/lib/hooks/servers/connection"
import { useDataStore } from "@/lib/stores/data"
import { Instance, Resource } from "@/lib/types/coolify"
import { Icon as ExpoIcon } from "@expo/ui"
import { upperFirstLetter } from "@/lib/utils"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { Component, Ellipsis, Library, LucideIcon, Search, Server, X } from "lucide-react-native"
import { useState } from "react"
import { Pressable, SectionList, TextInput, View } from "react-native"

type ParsedData =
  | { type: "servers"; params: ServerData[] }
  | { type: "resources"; params: Resource[] }
  | { type: "instances"; params: Instance[] }

type ItemState = "healthy" | "unhealthy" | "unknown"
type ItemFilter = "all" | ItemState
type ItemOrder = "ascending" | "descending"
type ResourceListRow =
  { kind: "project"; key: string; title: string } | { kind: "resource"; key: string; resource: Resource }

type ResourceServerSection = {
  key: string
  title: string
  connectionName: string | null
  data: ResourceListRow[]
}

const ITEM_STATE_CLASSES: Record<ItemState, { icon: string; container: string }> = {
  healthy: {
    icon: "text-emerald-600 dark:text-emerald-400",
    container: "bg-emerald-500/10",
  },
  unhealthy: {
    icon: "text-red-600 dark:text-red-400",
    container: "bg-red-500/10",
  },
  unknown: {
    icon: "text-muted-foreground",
    container: "bg-muted",
  },
}

const ItemIcon = ({ icon, state }: { icon: LucideIcon; state: ItemState }) => {
  const classes = ITEM_STATE_CLASSES[state]

  return (
    <View className={`h-10 w-10 items-center justify-center rounded-full ${classes.container}`}>
      <Icon as={icon} size={20} className={classes.icon} />
    </View>
  )
}

const EmptyList = ({ searching }: { searching: boolean }) => (
  <View className="flex-1 items-center justify-center gap-2 px-6">
    <Text className="text-lg font-semibold">{searching ? "No matches" : "No items"}</Text>
    <Text className="text-center text-muted-foreground">
      {searching
        ? "Try another search or adjust the active filter."
        : "Nothing is currently available in this list."}
    </Text>
  </View>
)

const InfraMoreMenu = ({
  filter,
  order,
  isRefreshing,
  onFilterChange,
  onOrderChange,
  onRefresh,
}: {
  filter: ItemFilter
  order: ItemOrder
  isRefreshing: boolean
  onFilterChange: (filter: ItemFilter) => void
  onOrderChange: (order: ItemOrder) => void
  onRefresh: () => void
}) => {
  const icons = {
    refresh: ExpoIcon.select({
      ios: "arrow.clockwise",
      android: import("@expo/material-symbols/refresh.xml"),
    }),
    filter: ExpoIcon.select({
      ios: "line.3.horizontal.decrease",
      android: import("@expo/material-symbols/filter_alt.xml"),
    }),
    ordering: ExpoIcon.select({
      ios: "arrow.up.arrow.down",
      android: import("@expo/material-symbols/sort.xml"),
    }),
  }

  return (
    <MenuView
      onPressAction={({ nativeEvent }) => {
        const action = nativeEvent.event
        if (["all", "healthy", "unhealthy", "unknown"].includes(action)) {
          onFilterChange(action as ItemFilter)
        } else if (action === "ascending" || action === "descending") {
          onOrderChange(action)
        } else if (action === "refresh") {
          onRefresh()
        }
      }}
      actions={[
        {
          id: "refresh",
          title: isRefreshing ? "Refreshing…" : "Refresh",
          image: icons.refresh,
          attributes: { disabled: isRefreshing },
        },
        {
          id: "filter",
          title: "Filter",
          image: icons.filter,
          subactions: [
            { id: "all", title: "All", state: filter === "all" ? "on" : "off" },
            { id: "healthy", title: "Healthy", state: filter === "healthy" ? "on" : "off" },
            { id: "unhealthy", title: "Needs Attention", state: filter === "unhealthy" ? "on" : "off" },
            { id: "unknown", title: "Unknown", state: filter === "unknown" ? "on" : "off" },
          ],
        },
        {
          id: "ordering",
          title: "Ordering",
          image: icons.ordering,
          subactions: [
            {
              id: "ascending",
              title: "Name: A–Z",
              state: order === "ascending" ? "on" : "off",
            },
            {
              id: "descending",
              title: "Name: Z–A",
              state: order === "descending" ? "on" : "off",
            },
          ],
        },
      ]}>
      <Button variant="ghost" accessibilityLabel="More list options">
        <Icon as={Ellipsis} />
      </Button>
    </MenuView>
  )
}

export default function Infra() {
  // screen options
  const { options } = useScreenOptions()

  // params
  const { id } = useLocalSearchParams<{
    id: "servers" | "instances" | "resources"
  }>()

  // Live store data replaces the navigation snapshot after a refresh.
  const servers = useDataStore((state) => state.servers)
  const resources = useDataStore((state) => state.resources)
  const instances = useDataStore((state) => state.instances)
  const parsedData: ParsedData =
    id === "servers"
      ? { type: id, params: servers }
      : id === "resources"
        ? { type: id, params: resources }
        : { type: id, params: instances }

  const [filter, setFilter] = useState<ItemFilter>("all")
  const [order, setOrder] = useState<ItemOrder>("ascending")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const connectionsById = new Map(servers.map((server) => [server.id, server]))
  const instancesById = new Map(instances.map((instance) => [instance.id, instance]))
  const stateMatches = (state: ItemState) => filter === "all" || filter === state
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const matchesSearch = (...values: Array<string | null | undefined>) =>
    !normalizedSearch || values.some((value) => value?.toLocaleLowerCase().includes(normalizedSearch))
  const serverState = (item: ServerData): ItemState =>
    item.health === "ok" ? "healthy" : item.health === "unknown" ? "unknown" : "unhealthy"
  const resourceState = (item: Resource): ItemState =>
    item.status === "running" ? "healthy" : item.status === "unknown" ? "unknown" : "unhealthy"
  const serverMatchesSearch = (item: ServerData) =>
    matchesSearch(item.nickname, item.endpoint, item.version, item.health)
  const instanceMatchesSearch = (item: Instance) => {
    const connection = connectionsById.get(item.connectionId)
    return matchesSearch(item.name, item.description, item.uuid, connection?.nickname, connection?.endpoint)
  }
  const resourceMatchesSearch = (item: Resource) => {
    const instance = instancesById.get(item.instanceId)
    const connection = connectionsById.get(item.connectionId)
    return matchesSearch(
      item.name,
      item.uuid,
      item.type,
      item.status,
      item.rawStatus,
      item.projectName,
      item.environmentName,
      instance?.name,
      connection?.nickname,
      connection?.endpoint
    )
  }
  const byName = <T extends { name?: string; nickname?: string }>(a: T, b: T) => {
    const comparison = (a.name ?? a.nickname ?? "").localeCompare(b.name ?? b.nickname ?? "")
    return order === "ascending" ? comparison : -comparison
  }

  const resourceSections = (items: Resource[]): ResourceServerSection[] => {
    const resourcesByServer = new Map<string, Resource[]>()

    for (const item of items) {
      const serverResources = resourcesByServer.get(item.instanceId) ?? []
      serverResources.push(item)
      resourcesByServer.set(item.instanceId, serverResources)
    }

    return [...resourcesByServer.entries()]
      .map(([instanceId, serverResources]) => {
        const instance = instancesById.get(instanceId)
        const connection = connectionsById.get(serverResources[0]?.connectionId ?? "")
        const resourcesByProject = new Map<string, { title: string; resources: Resource[] }>()

        for (const resource of serverResources) {
          const projectKey = resource.projectId ?? `${resource.connectionId}:unknown-project`
          const project = resourcesByProject.get(projectKey) ?? {
            title: resource.projectName ?? "Unknown project",
            resources: [],
          }
          project.resources.push(resource)
          resourcesByProject.set(projectKey, project)
        }

        const data = [...resourcesByProject.entries()]
          .sort(([, a], [, b]) => {
            const comparison = a.title.localeCompare(b.title)
            return order === "ascending" ? comparison : -comparison
          })
          .flatMap<ResourceListRow>(([projectKey, project]) => [
            { kind: "project", key: `project:${instanceId}:${projectKey}`, title: project.title },
            ...project.resources.sort(byName).map<ResourceListRow>((resource) => ({
              kind: "resource",
              key: resource.id,
              resource,
            })),
          ])

        return {
          key: instanceId,
          title: instance?.name ?? connection?.nickname ?? "Unknown server",
          connectionName: connection?.nickname ?? null,
          data,
        }
      })
      .sort((a, b) => {
        const comparison = a.title.localeCompare(b.title)
        return order === "ascending" ? comparison : -comparison
      })
  }

  const visibleCount =
    parsedData.type === "servers"
      ? parsedData.params.filter((item) => stateMatches(serverState(item)) && serverMatchesSearch(item))
          .length
      : parsedData.type === "instances"
        ? parsedData.params.filter(
            (item) => stateMatches(item.isReachable ? "healthy" : "unhealthy") && instanceMatchesSearch(item)
          ).length
        : parsedData.params.filter((item) => stateMatches(resourceState(item)) && resourceMatchesSearch(item))
            .length

  const openDetails = (type: ParsedData["type"], itemId: string) =>
    router.navigate({ pathname: "/(screens)/(resources)/[id]", params: { id: itemId, type } })

  const refresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      await refreshCoolifyData()
    } finally {
      setIsRefreshing(false)
    }
  }

  // list ui
  const renderList = () => {
    switch (parsedData.type) {
      case "servers": {
        const matchingServers = parsedData.params
          .filter((item) => stateMatches(serverState(item)) && serverMatchesSearch(item))
          .sort(byName)

        if (matchingServers.length === 0) return <EmptyList searching={Boolean(normalizedSearch)} />

        return (
          <DataList
            data={matchingServers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ListItem
                title={item.nickname}
                description={item.endpoint}
                leading={<ItemIcon icon={Server} state={serverState(item)} />}
                onPress={() => openDetails("servers", item.id)}
              />
            )}
          />
        )
      }

      case "resources": {
        const matchingResources = parsedData.params.filter(
          (item) => stateMatches(resourceState(item)) && resourceMatchesSearch(item)
        )

        return (
          <SectionList
            className="flex-1"
            contentContainerClassName="pb-2"
            sections={resourceSections(matchingResources)}
            keyExtractor={(item) => item.key}
            renderSectionHeader={({ section }) => (
              <View className="border-b border-border bg-background px-1 pb-3 pt-5">
                <Text className="text-lg font-semibold">{section.title}</Text>
                {section.connectionName && (
                  <Text className="text-xs text-muted-foreground">
                    Connected through {section.connectionName}
                  </Text>
                )}
              </View>
            )}
            renderItem={({ item }) => {
              if (item.kind === "project") {
                return (
                  <View className="bg-background px-1 pb-1 pt-4">
                    <Text className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      {item.title}
                    </Text>
                  </View>
                )
              }

              const resource = item.resource
              return (
                <ListItem
                  title={resource.name}
                  description={[
                    resource.environmentName,
                    upperFirstLetter(resource.type),
                    upperFirstLetter(resource.status),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  leading={<ItemIcon icon={Library} state={resourceState(resource)} />}
                  onPress={() => openDetails("resources", resource.id)}
                />
              )
            }}
            ListEmptyComponent={<EmptyList searching={Boolean(normalizedSearch)} />}
            alwaysBounceVertical={false}
            showsVerticalScrollIndicator={false}
          />
        )
      }

      case "instances": {
        const matchingInstances = parsedData.params
          .filter(
            (item) => stateMatches(item.isReachable ? "healthy" : "unhealthy") && instanceMatchesSearch(item)
          )
          .sort(byName)

        if (matchingInstances.length === 0) return <EmptyList searching={Boolean(normalizedSearch)} />

        return (
          <DataList
            data={matchingInstances}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ListItem
                title={item.name}
                description={item.description || (item.isReachable ? "Reachable" : "Unreachable")}
                leading={<ItemIcon icon={Component} state={item.isReachable ? "healthy" : "unhealthy"} />}
                onPress={() => openDetails("instances", item.id)}
              />
            )}
          />
        )
      }
    }
  }

  // screen
  return (
    <>
      <Stack.Screen
        options={options({
          title: `${upperFirstLetter(id)}`,
          headerBackButtonDisplayMode: "minimal",
          headerRight: () => (
            <InfraMoreMenu
              filter={filter}
              order={order}
              isRefreshing={isRefreshing}
              onFilterChange={setFilter}
              onOrderChange={setOrder}
              onRefresh={() => void refresh()}
            />
          ),
        })}
      />
      <View className="flex-1 p-4">
        <View className="mb-2 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Icon as={Search} size={18} className="text-muted-foreground" />
          <TextInput
            accessibilityLabel={`Search ${id}`}
            className="flex-1 pb-3 pt-2 text-base text-foreground"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={`Search ${id}`}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setSearchQuery("")}>
              <Icon as={X} size={18} className="text-muted-foreground" />
            </Pressable>
          )}
        </View>
        {renderList()}

        <View className="border-t border-border pt-4">
          <Text className="text-center text-xs text-muted-foreground">
            {visibleCount === parsedData.params.length
              ? `Total: ${parsedData.params.length}`
              : `Showing ${visibleCount} of ${parsedData.params.length}`}
          </Text>
        </View>
      </View>
    </>
  )
}
