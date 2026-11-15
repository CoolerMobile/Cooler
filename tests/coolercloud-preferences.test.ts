import { buildPushPreferences, pushPreferencesChanged } from "@/lib/cooler-cloud/preferences"
import type { Settings } from "@/lib/types/settings"
import { describe, expect, test } from "bun:test"

const at = (hours: number, minutes = 0) => new Date(2026, 10, 15, hours, minutes)

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  appLock: false,
  protectProductionActions: false,
  hideSensitiveValues: false,
  deploymentAlerts: true,
  backupAlerts: false,
  scheduledTaskAlerts: true,
  serverAlerts: true,
  quietFrom: at(22),
  quietTo: at(7, 30),
  ...overrides,
})

describe("buildPushPreferences", () => {
  test("turns settings into the preferences a bridge applies", () => {
    expect(buildPushPreferences(settings(), "Europe/Lisbon")).toEqual({
      timeZone: "Europe/Lisbon",
      quietHours: { from: 22 * 60, to: 7 * 60 + 30 },
      categories: { deployments: true, backups: false, scheduledTasks: true, servers: true },
    })
  })

  test("sends no window when quiet hours start and end together", () => {
    expect(buildPushPreferences(settings({ quietFrom: at(9), quietTo: at(9) }), "UTC").quietHours).toBeNull()
  })
})

describe("pushPreferencesChanged", () => {
  test("detects alert toggles and quiet hours", () => {
    expect(pushPreferencesChanged(settings({ backupAlerts: true }), settings())).toBe(true)
    expect(pushPreferencesChanged(settings({ quietTo: at(8) }), settings())).toBe(true)
  })

  test("ignores settings bridges do not use and equal dates", () => {
    expect(pushPreferencesChanged(settings({ appLock: true }), settings())).toBe(false)
    expect(pushPreferencesChanged(settings({ quietFrom: at(22) }), settings())).toBe(false)
  })
})
