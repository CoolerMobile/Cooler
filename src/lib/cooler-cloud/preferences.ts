import type { Settings } from "@/lib/types/settings"

/** notification preferences a bridge applies before pushing to this device */
export type PushPreferences = {
  timeZone: string
  quietHours: { from: number; to: number } | null
  categories: {
    deployments: boolean
    backups: boolean
    scheduledTasks: boolean
    servers: boolean
  }
}

/** settings that change what a bridge pushes */
export const PUSH_PREFERENCE_SETTINGS = [
  "deploymentAlerts",
  "backupAlerts",
  "scheduledTaskAlerts",
  "serverAlerts",
  "quietFrom",
  "quietTo",
] as const satisfies readonly (keyof Settings)[]

// calculate minutes since midnight
const minutesSinceMidnight = (date: Date) => date.getHours() * 60 + date.getMinutes()

/**
 * build the push preferences a bridge applies from the app settings
 *
 * matching quiet hours mean no window, the same rule the app applies itself
 *
 * @param settings app settings
 * @param timeZone iana time zone of this device
 *
 * @returns push preferences
 */
export const buildPushPreferences = (settings: Settings, timeZone: string): PushPreferences => {
  const from = minutesSinceMidnight(settings.quietFrom)
  const to = minutesSinceMidnight(settings.quietTo)

  return {
    timeZone,
    quietHours: from === to ? null : { from, to },
    categories: {
      deployments: settings.deploymentAlerts,
      backups: settings.backupAlerts,
      scheduledTasks: settings.scheduledTaskAlerts,
      servers: settings.serverAlerts,
    },
  }
}

/**
 * check whether a settings change affects what a bridge pushes
 *
 * @param next settings after the change
 * @param previous settings before the change
 *
 * @returns true when the push preferences need to be sent again
 */
export const pushPreferencesChanged = (next: Settings, previous: Settings) =>
  PUSH_PREFERENCE_SETTINGS.some((key) => {
    const [a, b] = [next[key], previous[key]]
    return a instanceof Date && b instanceof Date ? a.getTime() !== b.getTime() : a !== b
  })
