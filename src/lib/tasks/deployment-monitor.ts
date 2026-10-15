import { refreshDeploymentsAndNotify } from "@/lib/hooks/data/deployments"
import { captureBackgroundException } from "@/lib/hooks/sentry"
import { useDataStore } from "@/lib/stores/data"
import { useDeploymentStore } from "@/lib/stores/deployments"
import * as BackgroundTask from "expo-background-task"
import * as TaskManager from "expo-task-manager"
import { useEffect } from "react"

const DEPLOYMENT_MONITOR_TASK = "cooler-deployment-monitor"
const MINIMUM_BACKGROUND_INTERVAL_MINUTES = 15

export const registerDeploymentBackgroundTask = async () => {
  const status = await BackgroundTask.getStatusAsync()
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    throw Error("Background refresh is unavailable on this device.")
  }

  if (await TaskManager.isTaskRegisteredAsync(DEPLOYMENT_MONITOR_TASK)) return

  await BackgroundTask.registerTaskAsync(DEPLOYMENT_MONITOR_TASK, {
    minimumInterval: MINIMUM_BACKGROUND_INTERVAL_MINUTES,
  })
}

TaskManager.defineTask(DEPLOYMENT_MONITOR_TASK, async () => {
  try {
    // Headless launches do not mount React, so explicitly restore the secure
    // connection data and the user's persisted deployment watches.
    await Promise.all([useDataStore.persist.rehydrate(), useDeploymentStore.persist.rehydrate()])

    if (useDeploymentStore.getState().watchedDeploymentIds.length === 0) {
      return BackgroundTask.BackgroundTaskResult.Success
    }

    await refreshDeploymentsAndNotify()
    return BackgroundTask.BackgroundTaskResult.Success
  } catch (error) {
    await captureBackgroundException(DEPLOYMENT_MONITOR_TASK, error)
    console.error("[deployments] background monitor failed:", error)
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

/** Keeps the native background worker registered only while deployments are watched. */
export const useDeploymentBackgroundTask = () => {
  const hasHydratedWatches = useDeploymentStore((state) => state.hasHydratedWatches)
  const hasWatchedDeployments = useDeploymentStore((state) => state.watchedDeploymentIds.length > 0)

  useEffect(() => {
    if (!hasHydratedWatches) return

    const syncRegistration = async () => {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(DEPLOYMENT_MONITOR_TASK)

      if (!hasWatchedDeployments) {
        if (isRegistered) await BackgroundTask.unregisterTaskAsync(DEPLOYMENT_MONITOR_TASK)
        return
      }

      if (!isRegistered) await registerDeploymentBackgroundTask()
    }

    void syncRegistration().catch((error) =>
      console.error("[deployments] background registration failed:", error)
    )
  }, [hasHydratedWatches, hasWatchedDeployments])
}
