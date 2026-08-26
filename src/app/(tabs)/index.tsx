import { Icon } from "@/components/ui/icon"
import { Separator } from "@/components/ui/separator"
import { Text } from "@/components/ui/text"
import { HealthStatus, useOverview } from "@/lib/hooks/data/overview"
import { router } from "expo-router"
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
import { Pressable, View } from "react-native"

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
  // data
  const overviewData = useOverview()
  const health = HEALTH_PRESENTATION[overviewData.healthStatus]
  const healthDescription =
    overviewData.failedServerCount > 0
      ? `${overviewData.failedServerCount} Coolify ${overviewData.failedServerCount === 1 ? "connection could" : "connections could"} not be refreshed.`
      : health.description

  // ui
  return (
    <>
      <View className="flex-1 gap-8 p-4">
        <View
          accessible
          accessibilityLabel={`Status: ${overviewData.healthStatus}. ${healthDescription}`}
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
              <Text className="leading-5 text-muted-foreground">{healthDescription}</Text>
            </View>
          </View>

          <View className="flex-row border-t border-border pt-4">
            <StatusFact label="Servers" value={overviewData.servers.length} />
            <View className="w-hairline mx-4 bg-border" />
            <StatusFact label="Monitored resources" value={overviewData.resources.length} />
          </View>
        </View>

        <View className="gap-3">
          <View className="gap-1 px-1">
            <Text className="text-xl font-semibold">Infrastructure</Text>
            <Text className="text-sm text-muted-foreground">What Cooler can currently see</Text>
          </View>

          <View className="overflow-hidden rounded-2xl border border-border bg-card">
            <OverviewRow
              id="servers"
              icon={Server}
              title="Servers"
              description="Coolify connections"
              data={overviewData.servers}
            />
            <Separator />
            <OverviewRow
              id="instances"
              icon={Component}
              title="Instances"
              description="Deployment targets"
              data={overviewData.instances}
            />
            <Separator />
            <OverviewRow
              id="resources"
              icon={Library}
              title="Resources"
              description="Apps, databases, and services"
              data={overviewData.resources}
            />
          </View>
        </View>
      </View>
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
  id,
  icon,
  title,
  description,
  data,
}: {
  id: "servers" | "instances" | "resources"
  icon: LucideIcon
  title: string
  description: string
  data: any[]
}) {
  return (
    <Pressable
      accessible
      accessibilityLabel={`${title}: ${data.length}`}
      className="min-h-20 flex-row items-center gap-3 px-4 py-3"
      onPress={() => {
        router.navigate({
          pathname: `/infra/[id]`,
          params: { id },
        })
      }}>
      <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon as={icon} size={20} className="text-foreground" />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-semibold">{title}</Text>
        <Text className="text-sm text-muted-foreground">{description}</Text>
      </View>
      <Text className="text-2xl font-semibold tabular-nums">{data.length}</Text>
    </Pressable>
  )
}
