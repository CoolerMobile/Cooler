import { describe, expect, test } from "bun:test"
import type { ServerData } from "@/lib/hooks/servers/connection"
import type { Instance, Resource } from "@/lib/types/coolify"
import { HealthStatus } from "@/lib/types/coolify"
import { calculateIssueHealthStatus, collectHealthIssues, type HealthIssue } from "@/lib/coolify/health"

const connection: ServerData = {
  id: "connection-1",
  nickname: "Primary",
  endpoint: "https://coolify.example.com",
  token: "token",
  version: "4.0.0",
  health: "ok",
}

const instance: Instance = {
  id: "connection-1:instance-1",
  uuid: "instance-1",
  name: "Deployment server",
  description: "",
  connectionId: connection.id,
  isReachable: false,
}

const resource: Resource = {
  id: "connection-1:instance-1:resource-1",
  uuid: "resource-1",
  name: "API",
  type: "application",
  connectionId: connection.id,
  instanceId: instance.id,
  projectId: null,
  projectUuid: null,
  projectName: null,
  environmentName: null,
  rawStatus: "running:healthy",
  isReachable: false,
  status: "running",
  logs: [],
  logsUpdatedAt: null,
}

describe("collectHealthIssues", () => {
  test("reports a failed connection once instead of duplicating its cached instance and resources", () => {
    const issues = collectHealthIssues(
      [connection],
      [{ ...resource, rawStatus: "exited:unhealthy", status: "failed" }],
      [instance],
      true,
      [connection.id]
    )

    expect(issues.map((issue) => issue.id)).toEqual([`connection:${connection.id}`])
  })

  test("reports an unreachable instance without duplicating its unreachable resources", () => {
    const issues = collectHealthIssues([connection], [resource], [instance], true, [])

    expect(issues.map((issue) => issue.id)).toEqual([`instance:${instance.id}`])
  })

  test("keeps independent resource failures actionable", () => {
    const issues = collectHealthIssues(
      [connection],
      [
        {
          ...resource,
          isReachable: true,
          rawStatus: "exited:unhealthy",
          status: "failed",
        },
      ],
      [{ ...instance, isReachable: true }],
      true,
      []
    )

    expect(issues.map((issue) => issue.id)).toEqual([`resource:${resource.id}:failed`])
  })
})

describe("calculateIssueHealthStatus", () => {
  const issue = (severity: HealthIssue["severity"]): HealthIssue => ({
    id: severity,
    kind: "data",
    title: severity,
    description: severity,
    severity,
  })

  test("is healthy when no issues remain visible", () => {
    expect(calculateIssueHealthStatus([])).toBe(HealthStatus.HEALTHY)
  })

  test("uses the highest-priority visible issue", () => {
    expect(
      calculateIssueHealthStatus([
        issue(HealthStatus.DEGRADED),
        issue(HealthStatus.UNKNOWN),
        issue(HealthStatus.UNHEALTHY),
      ])
    ).toBe(HealthStatus.UNHEALTHY)

    expect(calculateIssueHealthStatus([issue(HealthStatus.DEGRADED), issue(HealthStatus.UNKNOWN)])).toBe(
      HealthStatus.UNKNOWN
    )
  })
})
