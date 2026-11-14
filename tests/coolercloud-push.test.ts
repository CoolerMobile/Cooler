import type { BridgeEvent } from "@/lib/cooler-cloud/bridge"
import {
  channelForEvent,
  presentBridgeEvent,
  readBridgeEventPush,
  readTaskPayload,
} from "@/lib/cooler-cloud/push"
import { describe, expect, test } from "bun:test"

const push = { type: "event.available", eventId: "evt-1", bridgeId: "br-1" }

const event = (overrides: Partial<BridgeEvent> = {}): BridgeEvent => ({
  id: "evt-1",
  bridgeId: "br-1",
  type: "coolify.backup_failed",
  severity: "error",
  title: "Backup failed",
  message: "Database backup failed",
  resourceType: "database",
  resourceId: "db-1",
  resourceName: "postgres",
  metadata: { errorOutput: "disk full" },
  createdAt: "2026-11-14T00:00:00.000Z",
  ...overrides,
})

describe("readBridgeEventPush", () => {
  test("reads the ids of a bridge event push", () => {
    expect(readBridgeEventPush(push)).toEqual({ eventId: "evt-1", bridgeId: "br-1" })
  })

  test("ignores other notification data", () => {
    expect(readBridgeEventPush({ ...push, type: "other" })).toBeNull()
    expect(readBridgeEventPush({ type: "event.available", eventId: 1, bridgeId: "br-1" })).toBeNull()
    expect(readBridgeEventPush(undefined)).toBeNull()
  })
})

describe("readTaskPayload", () => {
  test("parses the json data string both platforms deliver", () => {
    expect(readTaskPayload({ dataString: JSON.stringify(push) })).toEqual({
      eventId: "evt-1",
      bridgeId: "br-1",
    })
  })

  test("falls back to an object body", () => {
    expect(readTaskPayload({ body: push })).toEqual({ eventId: "evt-1", bridgeId: "br-1" })
  })

  test("ignores malformed data", () => {
    expect(readTaskPayload({ dataString: "{nope" })).toBeNull()
  })
})

describe("channelForEvent", () => {
  test("maps event types to their android channel", () => {
    expect(channelForEvent("deployment_success")).toBe("deployments")
    expect(channelForEvent("deployment.failed")).toBe("deployments")
    expect(channelForEvent("coolify.status_changed")).toBe("deployments")
    expect(channelForEvent("coolify.backup_failed")).toBe("backups")
    expect(channelForEvent("coolify.volume_backup_recovered")).toBe("backups")
    expect(channelForEvent("coolify.task_failed")).toBe("scheduled-tasks")
    expect(channelForEvent("coolify.high_disk_usage")).toBe("servers")
  })
})

describe("presentBridgeEvent", () => {
  test("leads the body with the resource name", () => {
    expect(presentBridgeEvent(event())).toEqual({
      title: "Backup failed",
      body: "postgres: Database backup failed",
      data: { errorOutput: "disk full", eventId: "evt-1", bridgeId: "br-1" },
      channelId: "backups",
    })
  })

  test("does not repeat a name the message already contains", () => {
    const content = presentBridgeEvent(event({ message: "Database backup for postgres works again." }))
    expect(content.body).toBe("Database backup for postgres works again.")
  })

  test("uses the message alone without a resource", () => {
    expect(presentBridgeEvent(event({ resourceName: null, metadata: null })).body).toBe(
      "Database backup failed"
    )
  })
})
