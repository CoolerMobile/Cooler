import { ListItem } from "@/components/custom/data/list-item"
import { Card, CardContent } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { HealthStatus, type HealthIssue, useOverview } from "@/lib/hooks/data/overview"
import { useScreenOptions } from "@/lib/hooks/screen-options"
import { router, Stack } from "expo-router"
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Component,
  DatabaseZap,
  Library,
  LucideIcon,
  Server,
  TriangleAlert,
} from "lucide-react-native"
import { FlatList, View } from "react-native"

const STATUS_PRESENTATION: Record<
  HealthStatus,
  { icon: LucideIcon; iconClassName: string; containerClassName: string; description: string }
> = {
  [HealthStatus.HEALTHY]: {
    icon: CircleCheck,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    containerClassName: "bg-emerald-500/10",
    description: "Everything being monitored is running normally.",
  },
  [HealthStatus.DEGRADED]: {
    icon: TriangleAlert,
    iconClassName: "text-amber-600 dark:text-amber-400",
    containerClassName: "bg-amber-500/10",
    description: "Infrastructure is reachable, but one or more resources need attention.",
  },
  [HealthStatus.UNHEALTHY]: {
    icon: CircleAlert,
    iconClassName: "text-red-600 dark:text-red-400",
    containerClassName: "bg-red-500/10",
    description: "A Coolify connection or deployment server is unreachable.",
  },
  [HealthStatus.UNKNOWN]: {
    icon: CircleHelp,
    iconClassName: "text-muted-foreground",
    containerClassName: "bg-muted",
    description: "Cooler does not have enough current data to determine health.",
  },
}

const ISSUE_ICON: Record<HealthIssue["kind"], LucideIcon> = {
  connection: Server,
  instance: Component,
  resource: Library,
  data: DatabaseZap,
}

const issuePresentation = (issue: HealthIssue) =>
  issue.severity === HealthStatus.UNHEALTHY
    ? { icon: "text-red-600 dark:text-red-400", container: "bg-red-500/10" }
    : issue.severity === HealthStatus.DEGRADED
      ? { icon: "text-amber-600 dark:text-amber-400", container: "bg-amber-500/10" }
      : { icon: "text-muted-foreground", container: "bg-muted" }

export default function HealthDetailsScreen() {
  const { options } = useScreenOptions()
  const overview = useOverview()
  const status = STATUS_PRESENTATION[overview.healthStatus]

  const openIssue = (issue: HealthIssue) => {
    if (!issue.target) return
    router.navigate({
      pathname: "/(screens)/(resources)/[id]",
      params: { id: issue.target.id, type: issue.target.type },
    })
  }

  return (
    <>
      <Stack.Screen
        options={options({
          title: "Status details",
          headerBackButtonDisplayMode: "minimal",
        })}
      />

      <FlatList
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        data={overview.healthIssues}
        keyExtractor={(issue) => issue.id}
        ListHeaderComponent={
          <View className="gap-5 px-4 pb-3 pt-4">
            <Card>
              <CardContent className="flex-row items-center gap-4 py-1">
                <View
                  className={`h-12 w-12 items-center justify-center rounded-full ${status.containerClassName}`}>
                  <Icon as={status.icon} size={24} className={status.iconClassName} />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Overall status
                  </Text>
                  <Text className="text-2xl font-bold">{overview.healthStatus}</Text>
                  <Text className="leading-5 text-muted-foreground">{status.description}</Text>
                </View>
              </CardContent>
            </Card>

            <View className="gap-1 px-1">
              <Text className="text-xl font-semibold">
                {overview.healthIssues.length === 0 ? "All clear" : "What needs attention"}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {overview.healthIssues.length === 0
                  ? "No current infrastructure issues were found."
                  : `${overview.healthIssues.length} ${overview.healthIssues.length === 1 ? "issue" : "issues"} found in the latest report.`}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const presentation = issuePresentation(item)
          return (
            <ListItem
              className="my-1"
              title={item.title}
              description={item.description}
              leading={
                <View
                  className={`h-10 w-10 items-center justify-center rounded-full ${presentation.container}`}>
                  <Icon as={ISSUE_ICON[item.kind]} size={20} className={presentation.icon} />
                </View>
              }
              trailing={item.target ? undefined : <View />}
              onPress={item.target ? () => openIssue(item) : undefined}
            />
          )
        }}
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
      />
    </>
  )
}
