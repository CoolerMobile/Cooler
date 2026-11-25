import { DemoEngine, DemoRequestError } from "@/lib/demo/engine"
import { DEMO_BRIDGE_ID, DEMO_PROJECTS, DEMO_SERVERS, isDemoToken } from "@/lib/demo/fixtures"
import { beforeEach, describe, expect, test } from "bun:test"

const PRODUCTION = "demo-production"
const HOMELAB = "demo-homelab"
const APP_SERVER = "k8w4s0cg8ok4c0w8kgss4wcc"
const API = "a4ckg0s8ww4ko8cg0sk4wgc8"
const WORKER = "o8sw0kc4gk4wcs8g0ko8sw4c"
const WEB = "s0wk4cg8kc8o4gsw0kogc4s8"
const DOCS = "n0wk8sc4go8kw0gc4s4kog8w"
const CACHE = "y0cs8kg4wo4gc0k8sw8okg4c"
const PLAUSIBLE = "i4wg0so8kc4k8gw0csk8og4w"

type Summary = { uuid: string; name: string; type: string; status: string }
type Deployment = {
  deployment_uuid: string
  application_name: string
  status: string
  logs: string
  commit: string
  rollback: boolean
  commit_message: string
}

let now = Date.parse("2026-11-25T12:00:00.000Z")
let engine: DemoEngine

const advance = (ms: number) => {
  now += ms
}

const get = <T>(connectionId: string, path: string) => engine.coolify(connectionId, { path }) as T
const post = <T>(connectionId: string, path: string, body?: Record<string, unknown>) =>
  engine.coolify(connectionId, { method: "POST", path, body }) as T

const statusOf = (connectionId: string, serverUuid: string, uuid: string) =>
  get<Summary[]>(connectionId, `servers/${serverUuid}/resources`).find((item) => item.uuid === uuid)?.status

const expectDemoError = (run: () => unknown, status: number) => {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(DemoRequestError)
    expect((error as DemoRequestError).status).toBe(status)
    return
  }
  throw Error("expected a demo request error")
}

beforeEach(() => {
  now = Date.parse("2026-11-25T12:00:00.000Z")
  engine = new DemoEngine({ now: () => now })
})

describe("coolify router", () => {
  test("answers health and version as plain text", () => {
    expect(get(PRODUCTION, "health")).toBe("OK")
    expect(get<string>(PRODUCTION, "version")).toMatch(/^4\.0\.0/)
  })

  test("lists only the servers of the requested connection", () => {
    const production = get<{ uuid: string; settings: { is_reachable: boolean } }[]>(PRODUCTION, "servers")
    const homelab = get<{ uuid: string }[]>(HOMELAB, "servers")

    expect(production.map((server) => server.uuid)).toEqual(
      DEMO_SERVERS.filter((server) => server.connectionId === PRODUCTION).map((server) => server.uuid)
    )
    expect(production.every((server) => server.settings.is_reachable)).toBe(true)
    expect(homelab).toHaveLength(1)
  })

  test("every resource joins to a project environment", () => {
    for (const connectionId of [PRODUCTION, HOMELAB]) {
      const projects = get<{ uuid: string }[]>(connectionId, "projects")
      const environmentIds = new Set(
        projects.flatMap((project) =>
          get<{ id: number }[]>(connectionId, `projects/${project.uuid}/environments`).map(({ id }) => id)
        )
      )
      const resources = get<{ environment_id: number }[]>(connectionId, "resources")

      expect(projects.length).toBe(
        DEMO_PROJECTS.filter((project) => project.connectionId === connectionId).length
      )
      expect(resources.length).toBeGreaterThan(0)
      expect(resources.every((resource) => environmentIds.has(resource.environment_id))).toBe(true)
    }
  })

  test("reports a mix of resource types and one stopped resource", () => {
    const resources = get<Summary[]>(PRODUCTION, "resources")
    const types = new Set(resources.map((resource) => resource.type))

    expect(types.has("application")).toBe(true)
    expect(types.has("service")).toBe(true)
    expect([...types].some((type) => type.startsWith("standalone-"))).toBe(true)
    expect(
      resources.filter((resource) => resource.status.startsWith("exited")).map(({ name }) => name)
    ).toEqual(["checkout-worker"])
  })

  test("describes service containers", () => {
    const service = get<{ applications: { name: string }[]; databases: { name: string }[] }>(
      PRODUCTION,
      `services/${PLAUSIBLE}`
    )

    expect(service.applications.map(({ name }) => name)).toEqual(["plausible"])
    expect(service.databases.map(({ name }) => name)).toEqual(["plausible-events-db", "plausible-db"])
  })

  test("rejects unknown connections and routes", () => {
    expectDemoError(() => get("not-a-demo", "servers"), 401)
    expectDemoError(() => get(PRODUCTION, "teams"), 404)
    expectDemoError(() => get(PRODUCTION, `applications/${DOCS}/logs`), 404)
  })
})

describe("resource actions", () => {
  test("restart reports restarting, then running", () => {
    post(PRODUCTION, `applications/${API}/restart`)
    expect(statusOf(PRODUCTION, APP_SERVER, API)).toBe("restarting:unknown")

    advance(1_000)
    expect(statusOf(PRODUCTION, APP_SERVER, API)).toBe("restarting:unknown")

    advance(3_000)
    expect(statusOf(PRODUCTION, APP_SERVER, API)).toBe("running:healthy")
  })

  test("stop settles to exited and start brings it back", () => {
    post(PRODUCTION, `databases/${CACHE}/stop`)
    advance(2_000)
    expect(statusOf(PRODUCTION, "m4kocs0gw8swc8ko4k0gcwg0", CACHE)).toBe("exited")

    post(PRODUCTION, `databases/${CACHE}/start`)
    expect(statusOf(PRODUCTION, "m4kocs0gw8swc8ko4k0gcwg0", CACHE)).toBe("starting:unknown")

    advance(3_500)
    expect(statusOf(PRODUCTION, "m4kocs0gw8swc8ko4k0gcwg0", CACHE)).toBe("running:healthy")
  })

  test("refuses actions that do not fit the current state", () => {
    expectDemoError(() => post(PRODUCTION, `applications/${API}/start`), 409)
    expectDemoError(() => post(PRODUCTION, `applications/${WORKER}/stop`), 409)

    post(PRODUCTION, `applications/${API}/restart`)
    expectDemoError(() => post(PRODUCTION, `applications/${API}/stop`), 409)
  })

  test("rejects an action on the wrong collection", () => {
    expectDemoError(() => post(PRODUCTION, `databases/${API}/restart`), 404)
  })
})

describe("deployments", () => {
  test("seeds history with successes, one failure and one in progress", () => {
    const applications = get<Summary[]>(PRODUCTION, "resources")
      .concat(get<Summary[]>(HOMELAB, "resources"))
      .filter((resource) => resource.type === "application")
    const connectionOf = (uuid: string) =>
      get<Summary[]>(PRODUCTION, "resources").some((resource) => resource.uuid === uuid)
        ? PRODUCTION
        : HOMELAB
    const statuses = applications.flatMap((application) =>
      get<{ deployments: Deployment[] }>(
        connectionOf(application.uuid),
        `deployments/applications/${application.uuid}?skip=0&take=20`
      ).deployments.map((deployment) => deployment.status)
    )

    expect(statuses.filter((status) => status === "failed")).toHaveLength(1)
    expect(statuses.filter((status) => status === "in_progress")).toHaveLength(1)
    expect(statuses.filter((status) => status === "finished").length).toBeGreaterThan(5)
  })

  test("a new deployment queues, builds and finishes", () => {
    const response = post<{ deployments: { deployment_uuid: string }[] }>(PRODUCTION, "deploy", { uuid: WEB })
    const uuid = response.deployments[0].deployment_uuid
    const read = () => get<Deployment>(PRODUCTION, `deployments/${uuid}`)

    expect(read().status).toBe("queued")
    expect(get<Deployment[]>(PRODUCTION, "deployments").map((item) => item.deployment_uuid)).toContain(uuid)

    advance(10_000)
    const building = read()
    expect(building.status).toBe("in_progress")
    const earlyLines = JSON.parse(building.logs).length

    advance(15_000)
    expect(JSON.parse(read().logs).length).toBeGreaterThan(earlyLines)

    advance(60_000)
    const finished = read()
    expect(finished.status).toBe("finished")
    expect(JSON.parse(finished.logs).at(-1).output).toBe("Rolling update completed.")
    expect(get<Deployment[]>(PRODUCTION, "deployments").map((item) => item.deployment_uuid)).not.toContain(
      uuid
    )

    const history = get<{ deployments: Deployment[] }>(
      PRODUCTION,
      `deployments/applications/${WEB}?skip=0&take=20`
    )
    expect(history.deployments[0].deployment_uuid).toBe(uuid)
  })

  test("a successful deployment brings a stopped application back", () => {
    expect(statusOf(PRODUCTION, APP_SERVER, WORKER)).toBe("exited:unhealthy")

    post(PRODUCTION, "deploy", { uuid: WORKER })
    advance(90_000)

    expect(statusOf(PRODUCTION, APP_SERVER, WORKER)).toBe("running:healthy")
  })

  test("a second deployment waits for the first one", () => {
    const first = post<{ deployments: { deployment_uuid: string }[] }>(PRODUCTION, "deploy", { uuid: WEB })
    const second = post<{ deployments: { deployment_uuid: string }[] }>(PRODUCTION, "deploy", { uuid: WEB })

    advance(10_000)
    expect(get<Deployment>(PRODUCTION, `deployments/${first.deployments[0].deployment_uuid}`).status).toBe(
      "in_progress"
    )
    expect(get<Deployment>(PRODUCTION, `deployments/${second.deployments[0].deployment_uuid}`).status).toBe(
      "queued"
    )
  })

  test("cancel stops an active deployment only", () => {
    const { deployments } = post<{ deployments: { deployment_uuid: string }[] }>(PRODUCTION, "deploy", {
      uuid: WEB,
    })
    const uuid = deployments[0].deployment_uuid

    advance(8_000)
    post(PRODUCTION, `deployments/${uuid}/cancel`)

    const cancelled = get<Deployment>(PRODUCTION, `deployments/${uuid}`)
    expect(cancelled.status).toBe("cancelled-by-user")
    expect(JSON.parse(cancelled.logs).at(-1).output).toBe("Deployment cancelled by user.")
    expectDemoError(() => post(PRODUCTION, `deployments/${uuid}/cancel`), 400)
  })

  test("a rollback deploys the pinned commit", () => {
    const history = get<{ deployments: Deployment[] }>(
      PRODUCTION,
      `deployments/applications/${WEB}?skip=0&take=20`
    )
    const target = history.deployments.at(-1)!

    engine.coolify(PRODUCTION, {
      method: "PATCH",
      path: `applications/${WEB}`,
      body: { git_commit_sha: target.commit },
    })
    const { deployments } = post<{ deployments: { deployment_uuid: string }[] }>(PRODUCTION, "deploy", {
      uuid: WEB,
      force: true,
    })
    const rollback = get<Deployment>(PRODUCTION, `deployments/${deployments[0].deployment_uuid}`)

    expect(rollback.commit).toBe(target.commit)
    expect(rollback.commit_message).toBe(target.commit_message)
    expect(rollback.rollback).toBe(true)
  })

  test("keeps at most twenty deployments per application", () => {
    for (let index = 0; index < 30; index++) {
      post(PRODUCTION, "deploy", { uuid: WEB })
      advance(120_000)
      get(PRODUCTION, "deployments")
    }

    const history = get<{ count: number }>(PRODUCTION, `deployments/applications/${WEB}?skip=0&take=50`)
    expect(history.count).toBeLessThanOrEqual(20)
  })
})

describe("runtime logs", () => {
  const logs = (path: string) => get<{ logs: string }>(PRODUCTION, path).logs

  test("are deterministic for the same moment", () => {
    const other = new DemoEngine({ now: () => now })
    expect(logs(`applications/${WEB}/logs?lines=20`)).toBe(
      (other.coolify(PRODUCTION, { path: `applications/${WEB}/logs?lines=20` }) as { logs: string }).logs
    )
  })

  test("return at most the requested lines, with timestamps", () => {
    const lines = logs(`applications/${API}/logs?lines=25&show_timestamps=true`).split("\n")

    expect(lines).toHaveLength(25)
    expect(lines.every((line) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /.test(line))).toBe(true)
  })

  test("stream new lines as time passes", () => {
    const before = logs(`applications/${API}/logs?lines=100`)
    advance(30_000)
    const after = logs(`applications/${API}/logs?lines=100`)

    expect(after).not.toBe(before)
    expect(after.split("\n").at(-1)! > before.split("\n").at(-1)!).toBe(true)
  })

  test("stay frozen with a crash for an exited application", () => {
    const before = logs(`applications/${WORKER}/logs?lines=10`)
    advance(60_000)

    expect(logs(`applications/${WORKER}/logs?lines=10`)).toBe(before)
    expect(before).toContain("exiting with code 1")
  })

  test("start over after a restart", () => {
    post(PRODUCTION, `applications/${API}/restart`)
    advance(500)
    expect(logs(`applications/${API}/logs?lines=5`)).toContain("shutdown complete")

    advance(3_500)
    expect(logs(`applications/${API}/logs?lines=100`).split("\n")[0]).toContain("loading configuration")
  })

  test("serve each service container separately", () => {
    const app = logs(`services/${PLAUSIBLE}/logs?sub_service_name=plausible&lines=5`)
    const database = logs(`services/${PLAUSIBLE}/logs?sub_service_name=plausible-events-db&lines=5`)

    expect(app).not.toBe(database)
    expectDemoError(() => logs(`services/${PLAUSIBLE}/logs?sub_service_name=missing`), 404)
  })
})

describe("bridge events", () => {
  test("announce the seeded deployment once when it finishes", () => {
    expect(engine.drain().events).toEqual([])

    advance(120_000)
    const { events, changed } = engine.drain()

    expect(changed).toBe(true)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      bridgeId: DEMO_BRIDGE_ID,
      type: "coolify.deployment_success",
      resourceName: "storefront-api",
    })
    expect(events[0].metadata?.connectionId).toBe(PRODUCTION)
    expect(engine.drain().events).toEqual([])
  })

  test("are not produced for a connection without a bridge", () => {
    advance(120_000)
    engine.drain()

    engine.coolify(HOMELAB, { method: "POST", path: "deploy", body: { uuid: DOCS } })
    advance(120_000)

    const { events, changed } = engine.drain()
    expect(changed).toBe(true)
    expect(events).toEqual([])
  })

  test("history carries the connection so it can be cleaned up", () => {
    const events = engine.bridge("https://bridge.demo.invalid", { path: "events" }) as {
      metadata: Record<string, unknown> | null
    }[]

    expect(events.length).toBeGreaterThan(3)
    expect(events.every((event) => event.metadata?.connectionId === PRODUCTION)).toBe(true)
  })
})

describe("coolercloud and coolerbridge", () => {
  const bridgeUrl = "https://bridge.demo.invalid"

  test("signs into the demo account with a demo token", () => {
    const session = engine.cloud({ method: "POST", path: "auth/token", body: { code: "demo" } }) as {
      token: string
      user: { email: string }
    }
    const account = engine.cloud({ path: "me", token: session.token }) as {
      bridges: { cloudBridgeId: string }[]
    }

    expect(isDemoToken(session.token)).toBe(true)
    expect(account.bridges.map((link) => link.cloudBridgeId)).toEqual([DEMO_BRIDGE_ID])
  })

  test("unpairing removes the bridge from the account", () => {
    engine.cloud({ method: "DELETE", path: `bridges/${DEMO_BRIDGE_ID}`, token: "demo_x" })
    expect((engine.cloud({ path: "me", token: "demo_x" }) as { bridges: unknown[] }).bridges).toEqual([])
  })

  test("deleting the demo account only resets the demo", () => {
    engine.cloud({ method: "DELETE", path: `bridges/${DEMO_BRIDGE_ID}`, token: "demo_x" })
    expect(engine.cloud({ method: "DELETE", path: "me", token: "demo_x" })).toEqual({ deleted: true })
    expect((engine.cloud({ path: "me", token: "demo_x" }) as { bridges: unknown[] }).bridges).toHaveLength(1)
  })

  test("pairs a bridge through the regular challenge flow", () => {
    const pairUrl = "https://bridge.example.com"
    const challenge = engine.bridge(pairUrl, { method: "POST", path: "pairing" }) as {
      id: string
      code: string
    }
    const { assertion } = engine.cloud({
      method: "POST",
      path: "bridges/cb_new/assertions/pair",
      token: "demo_x",
      body: { pairingId: challenge.id },
    }) as { assertion: string }
    const linked = engine.bridge(pairUrl, {
      method: "POST",
      path: "pairing/complete",
      body: { code: challenge.code, assertion },
    })
    const confirmed = engine.cloud({
      method: "POST",
      path: "bridges/cb_new/assertions/pair/confirm",
      token: "demo_x",
      body: { pairingId: challenge.id },
    })

    expect(linked).toEqual({ linked: true, cloudBridgeId: "cb_new" })
    expect(confirmed).toEqual({ paired: true })
    expect(
      (engine.cloud({ path: "me", token: "demo_x" }) as { bridges: { baseUrl: string }[] }).bridges.map(
        (link) => link.baseUrl
      )
    ).toContain(pairUrl)
  })

  test("registers devices without an event token", () => {
    const device = engine.bridge(bridgeUrl, {
      method: "POST",
      path: "devices",
      token: "demo_cbt",
      body: { deviceData: { platform: "ios", pushToken: "ExponentPushToken[x]" } },
    }) as Record<string, unknown>

    expect(device.platform).toBe("ios")
    expect(device.eventToken).toBeUndefined()
  })
})
