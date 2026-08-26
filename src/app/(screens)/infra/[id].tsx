import { DataList } from "@/components/custom/data/list"
import { ListItem } from "@/components/custom/data/list-item"
import { RefreshList } from "@/components/custom/refresh-list"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useScreenOptions } from "@/lib/hooks/screen-options"
import { ServerData } from "@/lib/hooks/servers/connection"
import { Instance, Resource } from "@/lib/types/coolify"
import { upperFirstLetter } from "@/lib/utils"
import { Stack, useLocalSearchParams } from "expo-router"
import { Component, Library, LucideIcon, Server } from "lucide-react-native"
import { View } from "react-native"

type ParsedData =
  | { type: "servers"; params: ServerData[] }
  | { type: "resources"; params: Resource[] }
  | { type: "instances"; params: Instance[] }

type ItemState = "healthy" | "unhealthy" | "unknown"

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

const parseData = (type: ParsedData["type"], data: string): ParsedData => {
  switch (type) {
    case "servers":
      return { type, params: JSON.parse(data) as ServerData[] }

    case "resources":
      return { type, params: JSON.parse(data) as Resource[] }

    case "instances":
      return { type, params: JSON.parse(data) as Instance[] }
  }
}

export default function Infra() {
  // screen options
  const { options } = useScreenOptions()

  // params
  const { id, data } = useLocalSearchParams<{
    id: "servers" | "instances" | "resources"
    data: string
  }>()

  // parsed data
  const parsedData = parseData(id, data)

  // list ui
  const renderList = () => {
    switch (parsedData.type) {
      case "servers":
        return (
          <DataList
            data={parsedData.params}
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
              />
            )}
          />
        )

      case "resources":
        return (
          <DataList
            data={parsedData.params}
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
              />
            )}
          />
        )

      case "instances":
        return (
          <DataList
            data={parsedData.params}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ListItem
                title={item.name}
                description={item.description || (item.isReachable ? "Reachable" : "Unreachable")}
                leading={<ItemIcon icon={Component} state={item.isReachable ? "healthy" : "unhealthy"} />}
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
          headerRight: () => <RefreshList onPress={() => {}} />,
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
