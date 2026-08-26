import { DataList } from "@/components/custom/data/list"
import { ListItem } from "@/components/custom/data/list-item"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { refreshCoolifyData } from "@/lib/hooks/data/coolify"
import { useScreenOptions } from "@/lib/hooks/screen-options"
import { ServerData } from "@/lib/hooks/servers/connection"
import { useDataStore } from "@/lib/stores/data"
import { Instance, Resource } from "@/lib/types/coolify"
import { Icon as ExpoIcon } from "@expo/ui"
import { MenuView } from "@expo/ui/community/menu"
import { upperFirstLetter } from "@/lib/utils"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { Component, Ellipsis, Library, LucideIcon, Server } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"

type ParsedData =
  | { type: "servers"; params: ServerData[] }
  | { type: "resources"; params: Resource[] }
  | { type: "instances"; params: Instance[] }

type ItemState = "healthy" | "unhealthy" | "unknown"
type ItemFilter = "all" | ItemState
type ItemOrder = "ascending" | "descending"

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

  const stateMatches = (state: ItemState) => filter === "all" || filter === state
  const byName = <T extends { name?: string; nickname?: string }>(a: T, b: T) => {
    const comparison = (a.name ?? a.nickname ?? "").localeCompare(b.name ?? b.nickname ?? "")
    return order === "ascending" ? comparison : -comparison
  }

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
      case "servers":
        return (
          <DataList
            data={parsedData.params
              .filter((item) =>
                stateMatches(
                  item.health === "ok" ? "healthy" : item.health === "unknown" ? "unknown" : "unhealthy"
                )
              )
              .sort(byName)}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ListItem
                title={item.nickname}
                description={item.endpoint}
                leading={
                  <ItemIcon
                    icon={Server}
                    state={
                      item.health === "ok" ? "healthy" : item.health === "unknown" ? "unknown" : "unhealthy"
                    }
                  />
                }
                onPress={() => openDetails("servers", item.id)}
              />
            )}
          />
        )

      case "resources":
        return (
          <DataList
            data={parsedData.params
              .filter((item) =>
                stateMatches(
                  item.status === "running" ? "healthy" : item.status === "unknown" ? "unknown" : "unhealthy"
                )
              )
              .sort(byName)}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ListItem
                title={item.name}
                description={`${upperFirstLetter(item.type)} · ${upperFirstLetter(item.status)}`}
                leading={
                  <ItemIcon
                    icon={Library}
                    state={
                      item.status === "running"
                        ? "healthy"
                        : item.status === "unknown"
                          ? "unknown"
                          : "unhealthy"
                    }
                  />
                }
                onPress={() => openDetails("resources", item.id)}
              />
            )}
          />
        )

      case "instances":
        return (
          <DataList
            data={parsedData.params
              .filter((item) => stateMatches(item.isReachable ? "healthy" : "unhealthy"))
              .sort(byName)}
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
        {renderList()}

        <View className="border-t border-border pt-4">
          <Text className="text-center text-xs text-muted-foreground">Total: {parsedData.params.length}</Text>
        </View>
      </View>
    </>
  )
}
