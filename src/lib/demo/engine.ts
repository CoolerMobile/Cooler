import type { BridgeEvent } from "@/lib/cooler-cloud/bridge"
import {
  DEMO_BRIDGE,
  DEMO_COMMIT_MESSAGES,
  DEMO_COOLIFY_VERSION,
  DEMO_CONNECTIONS,
  DEMO_PROJECTS,
  DEMO_RESOURCES,
  DEMO_SERVERS,
  DEMO_TOKEN_PREFIX,
  DEMO_USER,
  type DemoConnectionFixture,
  type DemoLogProfile,
  type DemoResourceFixture,
} from "@/lib/demo/fixtures"
import {
  between,
  commitSha,
  deploymentLogEntries,
  runtimeLogs,
  seededId,
  type DemoLogSegment,
} from "@/lib/demo/generators"
import type { BridgeLink } from "@/lib/types/account"

// how long coolify keeps a deployment queued before it starts
const QUEUE_MS = 4_000

// how long lifecycle actions take to settle
const RESTART_MS = 3_000
const START_MS = 3_000
const STOP_MS = 1_500

// coolify returns at most this many deployments per application
const HISTORY_LIMIT = 20

// bounds so a long demo session never grows memory
const EVENT_LIMIT = 50
const PENDING_EVENT_LIMIT = 20
const CHALLENGE_LIMIT = 10

const DEFAULT_LOG_LINES = 100
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** a failed demo request, carrying the http status coolify would answer with */
export class DemoRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "DemoRequestError"
  }
}

/** a request routed to the demo */
export type DemoRequest = {
  method?: string
  path: string
  body?: unknown
  token?: string
}

/** what changed since the last drain */
export type DemoDrain = {
  /** bridge events to present as push notifications */
  events: BridgeEvent[]
  /** whether resources or deployments changed state */
  changed: boolean
}

type Transition = {
  /** status reported while the action runs */
  status: string
  /** status reported once it settles */
  next: string
  until: number
  action: "start" | "restart" | "stop"
}

type ResourceState = {
  fixture: DemoResourceFixture
  connection: DemoConnectionFixture
  serverName: string
  status: string
  transition: Transition | null
  log: DemoLogSegment
  /** commit a rollback pinned for the next deployment */
  pinnedCommit: string | null
  /** deployments started in the demo, used to vary commits */
  deployCount: number
}

type DeploymentState = {
  id: number
  uuid: string
  resource: ResourceState
  commit: string
  commitMessage: string
  isWebhook: boolean
  isApi: boolean
  rollback: boolean
  forceRebuild: boolean
  createdAt: number
  startsAt: number
  endsAt: number
  outcome: "finished" | "failed"
  cancelledAt: number | null
  /** whether its end has been applied and announced */
  settled: boolean
}

type Route = {
  method: string
  segments: string[]
  query: URLSearchParams
  body: Record<string, unknown>
  token?: string
}

/**
 * split a request into a route
 *
 * @param request demo request
 *
 * @returns method, decoded path segments, query and body
 */
const parseRoute = ({ method = "GET", path, body, token }: DemoRequest): Route => {
  const [pathname, search = ""] = path.split("?")
  return {
    method: method.toUpperCase(),
    segments: pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment)),
    query: new URLSearchParams(search),
    body: body && typeof body === "object" ? (body as Record<string, unknown>) : {},
    token,
  }
}

const notFound = (): never => {
  throw new DemoRequestError(404, "This isn't available in the demo.")
}

const iso = (time: number) => new Date(time).toISOString()

/**
 * in-memory coolify, coolercloud and coolerbridge used by demo mode
 *
 * answers the same api paths the app calls with payloads shaped like the real
 * services, and moves state forward with time: actions settle after a few
 * seconds, deployments queue, build and finish, and runtime logs keep growing
 *
 * everything is derived lazily from timestamps, so no timers are needed and
 * a clock can be injected for tests
 */
export class DemoEngine {
  private readonly now: () => number
  private readonly startedAt: number
  private readonly resources: ResourceState[]
  private readonly deployments: DeploymentState[] = []
  private readonly events: BridgeEvent[] = []
  private pendingEvents: BridgeEvent[] = []
  private readonly challenges = new Map<string, { code: string; cloudBridgeId: string | null }>()
  private accountBridges: BridgeLink[] = [{ ...DEMO_BRIDGE }]
  private deploymentSequence = 0
  private challengeSequence = 0
  private changed = false

  constructor({ now = Date.now }: { now?: () => number } = {}) {
    this.now = now
    this.startedAt = now()

    this.resources = DEMO_RESOURCES.map((fixture) => {
      const server = DEMO_SERVERS.find((item) => item.uuid === fixture.serverUuid)!
      const connection = DEMO_CONNECTIONS.find((item) => item.id === server.connectionId)!
      const exitedAt =
        fixture.exitedMinutesAgo === undefined ? null : this.startedAt - fixture.exitedMinutesAgo * MINUTE_MS

      return {
        fixture,
        connection,
        serverName: server.name,
        status: fixture.status,
        transition: null,
        log: {
          anchor: this.startedAt - fixture.uptimeHours * HOUR_MS,
          offset: 0,
          frozenAt: exitedAt,
          ending: exitedAt === null ? null : "crash",
        },
        pinnedCommit: null,
        deployCount: 0,
      }
    })

    this.seedDeployments()
    this.seedEvents()
  }

  /** create the deployment history, settling everything that already ended */
  private seedDeployments() {
    for (const resource of this.resources) {
      for (const [index, seed] of (resource.fixture.deployments ?? []).entries()) {
        const createdAt = this.startedAt - seed.minutesAgo * MINUTE_MS
        const startsAt = createdAt + QUEUE_MS
        const deployment = this.addDeployment({
          resource,
          uuid: seededId(`deployment:${resource.fixture.uuid}:${index}`),
          commit: commitSha(`commit:${resource.fixture.uuid}:${index}`),
          commitMessage: seed.commitMessage,
          isWebhook: seed.trigger === "webhook",
          isApi: seed.trigger === "api",
          rollback: false,
          createdAt,
          startsAt,
          endsAt: startsAt + seed.durationSeconds * 1_000,
          outcome: seed.outcome === "failed" ? "failed" : "finished",
        })

        // history already happened, only the in progress one is announced
        if (deployment.endsAt <= this.startedAt) {
          deployment.settled = true
          const event = this.deploymentEvent(deployment)
          if (event) this.events.push(event)
        }
      }
    }
  }

  /** bridge events that are not deployments, such as backups and crashes */
  private seedEvents() {
    const database = this.resources.find(({ fixture }) => fixture.name === "storefront-db")
    const worker = this.resources.find(({ fixture }) => fixture.name === "checkout-worker")

    for (const [hoursAgo, size] of [
      [27, "41.9 MB"],
      [3, "42.7 MB"],
    ] as const) {
      if (!database?.connection.bridgeId) continue
      const createdAt = this.startedAt - hoursAgo * HOUR_MS
      this.events.push({
        id: seededId(`event:backup:${hoursAgo}`),
        bridgeId: database.connection.bridgeId,
        type: "coolify.backup_success",
        severity: "success",
        title: "Backup succeeded",
        message: `storefront-db was backed up (${size}).`,
        resourceType: "database",
        resourceId: database.fixture.uuid,
        resourceName: database.fixture.name,
        metadata: { connectionId: database.connection.id, resourceUuid: database.fixture.uuid },
        createdAt: iso(createdAt),
      })
    }

    if (worker?.connection.bridgeId && worker.log.frozenAt !== null) {
      this.events.push({
        id: seededId("event:worker-exited"),
        bridgeId: worker.connection.bridgeId,
        type: "coolify.status_changed",
        severity: "warning",
        title: "Container exited",
        message: "checkout-worker exited unexpectedly with code 1.",
        resourceType: "application",
        resourceId: worker.fixture.uuid,
        resourceName: worker.fixture.name,
        metadata: { connectionId: worker.connection.id, resourceUuid: worker.fixture.uuid },
        createdAt: iso(worker.log.frozenAt),
      })
    }

    this.events.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    this.events.splice(0, Math.max(0, this.events.length - EVENT_LIMIT))
  }

  private addDeployment(
    input: Omit<DeploymentState, "id" | "forceRebuild" | "cancelledAt" | "settled"> & {
      forceRebuild?: boolean
    }
  ): DeploymentState {
    const deployment: DeploymentState = {
      ...input,
      id: ++this.deploymentSequence,
      forceRebuild: input.forceRebuild ?? false,
      cancelledAt: null,
      settled: false,
    }
    this.deployments.push(deployment)

    // keep only the newest history per application
    const history = this.deployments.filter((item) => item.resource === input.resource)
    for (const stale of history.slice(0, Math.max(0, history.length - HISTORY_LIMIT))) {
      if (!stale.settled) continue
      this.deployments.splice(this.deployments.indexOf(stale), 1)
    }

    return deployment
  }

  /**
   * apply every transition and deployment end that happened by now
   *
   * @param now current time
   */
  private settle(now: number) {
    const ended = this.deployments
      .filter((deployment) => !deployment.settled && (deployment.cancelledAt ?? deployment.endsAt) <= now)
      .sort((a, b) => (a.cancelledAt ?? a.endsAt) - (b.cancelledAt ?? b.endsAt))

    for (const deployment of ended) {
      deployment.settled = true
      this.changed = true

      // a successful rollout replaces the running container
      if (deployment.cancelledAt === null && deployment.outcome === "finished") {
        const { resource } = deployment
        resource.status = "running:healthy"
        resource.transition = null
        resource.log = this.nextSegment(resource.log, deployment.endsAt)
      }

      const event = deployment.cancelledAt === null ? this.deploymentEvent(deployment) : null
      if (event) this.announce(event)
    }

    for (const resource of this.resources) {
      const { transition } = resource
      if (!transition || transition.until > now) continue

      resource.status = transition.next
      resource.transition = null
      this.changed = true

      if (transition.action === "stop") {
        resource.log = { ...resource.log, frozenAt: transition.until, ending: "stop" }
      } else {
        resource.log = this.nextSegment(resource.log, transition.until)
      }
    }
  }

  /**
   * a fresh container run starting at a point in time
   *
   * @param previous the run being replaced
   * @param anchor when the new run starts
   *
   * @returns the new run
   */
  private nextSegment(previous: DemoLogSegment, anchor: number): DemoLogSegment {
    return { anchor, offset: previous.offset + 100_000, frozenAt: null, ending: null }
  }

  /** queue a bridge event for push and keep it in the bridge history */
  private announce(event: BridgeEvent) {
    this.events.push(event)
    this.events.splice(0, Math.max(0, this.events.length - EVENT_LIMIT))
    this.pendingEvents.push(event)
    this.pendingEvents.splice(0, Math.max(0, this.pendingEvents.length - PENDING_EVENT_LIMIT))
  }

  /**
   * take the bridge events and changes since the last drain
   *
   * @returns events to present and whether anything changed
   */
  drain(): DemoDrain {
    this.settle(this.now())

    const drained = { events: this.pendingEvents, changed: this.changed }
    this.pendingEvents = []
    this.changed = false
    return drained
  }

  /**
   * answer a coolify api request for a demo connection
   *
   * @param connectionId saved connection id
   * @param request method, path below /api/v1 and body
   *
   * @returns the response body coolify would send
   */
  coolify(connectionId: string, request: DemoRequest): unknown {
    const connection = DEMO_CONNECTIONS.find((item) => item.id === connectionId)
    if (!connection) throw new DemoRequestError(401, "Unauthenticated.")

    const now = this.now()
    this.settle(now)

    const route = parseRoute(request)
    const [collection, id, action, extra] = route.segments
    const { method } = route

    if (method === "GET" && collection === "health" && !id) return "OK"
    if (method === "GET" && collection === "version" && !id) return DEMO_COOLIFY_VERSION

    if (collection === "servers" && method === "GET") {
      if (!id) return this.serverList(connection)
      if (action === "resources" && !extra) return this.serverResources(connection, id)
      return notFound()
    }

    if (collection === "projects" && method === "GET") {
      if (!id) return this.projectList(connection)
      if (action === "environments" && !extra) return this.environmentList(connection, id)
      return notFound()
    }

    if (collection === "resources" && method === "GET" && !id) return this.resourceList(connection)

    if (collection === "services" && method === "GET" && id && !action) return this.service(connection, id)

    if (
      ["applications", "databases", "services"].includes(collection) &&
      id &&
      action === "logs" &&
      method === "GET"
    ) {
      return this.logs(connection, collection, id, route.query, now)
    }

    if (
      ["applications", "databases", "services"].includes(collection) &&
      id &&
      (action === "start" || action === "restart" || action === "stop") &&
      !extra
    ) {
      return this.lifecycle(connection, collection, id, action, now)
    }

    if (collection === "applications" && id && !action && method === "PATCH") {
      return this.pinCommit(connection, id, route.body)
    }

    if (collection === "deploy" && !id && (method === "POST" || method === "GET")) {
      return this.deploy(connection, route, now)
    }

    if (collection === "deployments") {
      if (!id && method === "GET") return this.activeDeployments(connection, now)
      if (id === "applications" && action && method === "GET") {
        return this.applicationDeployments(connection, action, route.query, now)
      }
      if (id && action === "cancel" && method === "POST") return this.cancel(connection, id, now)
      if (id && !action && method === "GET")
        return this.deploymentPayload(this.findDeployment(connection, id), now)
    }

    return notFound()
  }

  private resourcesFor(connection: DemoConnectionFixture) {
    return this.resources.filter((resource) => resource.connection === connection)
  }

  private findResource(connection: DemoConnectionFixture, uuid: string, collection?: string): ResourceState {
    const resource = this.resourcesFor(connection).find(({ fixture }) => fixture.uuid === uuid)
    if (!resource || (collection && collectionFor(resource.fixture.type) !== collection)) {
      throw new DemoRequestError(404, "Resource not found.")
    }

    return resource
  }

  private findDeployment(connection: DemoConnectionFixture, uuid: string): DeploymentState {
    const deployment = this.deployments.find(
      (item) => item.uuid === uuid && item.resource.connection === connection
    )
    if (!deployment) throw new DemoRequestError(404, "Deployment not found.")

    return deployment
  }

  /** the reported status, including any action that is still running */
  private statusOf(resource: ResourceState): string {
    return resource.transition?.status ?? resource.status
  }

  private serverList(connection: DemoConnectionFixture) {
    return DEMO_SERVERS.filter((server) => server.connectionId === connection.id).map((server) => ({
      id: server.id,
      uuid: server.uuid,
      name: server.name,
      description: server.description,
      ip: server.ip,
      user: "root",
      port: 22,
      proxy: { type: "traefik", status: "running" },
      settings: { is_reachable: true, is_usable: true, is_build_server: false },
    }))
  }

  private resourceSummary(resource: ResourceState) {
    const { fixture } = resource
    return {
      id: fixture.id,
      uuid: fixture.uuid,
      name: fixture.name,
      type: fixture.type,
      created_at: iso(this.startedAt - 90 * 24 * HOUR_MS),
      updated_at: iso(resource.log.anchor),
      status: this.statusOf(resource),
    }
  }

  private serverResources(connection: DemoConnectionFixture, serverUuid: string) {
    if (!DEMO_SERVERS.some((server) => server.uuid === serverUuid && server.connectionId === connection.id)) {
      throw new DemoRequestError(404, "Server not found.")
    }

    return this.resourcesFor(connection)
      .filter(({ fixture }) => fixture.serverUuid === serverUuid)
      .map((resource) => this.resourceSummary(resource))
  }

  private projectList(connection: DemoConnectionFixture) {
    return DEMO_PROJECTS.filter((project) => project.connectionId === connection.id).map((project) => ({
      id: project.id,
      uuid: project.uuid,
      name: project.name,
      description: project.description,
    }))
  }

  private environmentList(connection: DemoConnectionFixture, projectUuid: string) {
    const project = DEMO_PROJECTS.find(
      (item) => item.uuid === projectUuid && item.connectionId === connection.id
    )
    if (!project) throw new DemoRequestError(404, "Project not found.")

    return project.environments.map((environment) => ({
      id: environment.id,
      name: environment.name,
      project_id: project.id,
      description: null,
      created_at: iso(this.startedAt - 120 * 24 * HOUR_MS),
      updated_at: iso(this.startedAt - 120 * 24 * HOUR_MS),
    }))
  }

  private resourceList(connection: DemoConnectionFixture) {
    return this.resourcesFor(connection).map((resource) => ({
      ...this.resourceSummary(resource),
      environment_id: resource.fixture.environmentId,
    }))
  }

  private service(connection: DemoConnectionFixture, uuid: string) {
    const resource = this.findResource(connection, uuid, "services")
    const subResources = resource.fixture.subResources ?? []
    const describe = (kind: "application" | "database") =>
      subResources
        .filter((sub) => sub.kind === kind)
        .map((sub, index) => ({
          id: index + 1,
          uuid: seededId(`sub:${uuid}:${sub.name}`),
          name: sub.name,
          image: sub.image,
          status: this.statusOf(resource),
        }))

    return {
      ...this.resourceSummary(resource),
      environment_id: resource.fixture.environmentId,
      applications: describe("application"),
      databases: describe("database"),
    }
  }

  private logs(
    connection: DemoConnectionFixture,
    collection: string,
    uuid: string,
    query: URLSearchParams,
    now: number
  ) {
    const resource = this.findResource(connection, uuid, collection)
    const requested = Number(query.get("lines"))
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 1_000) : DEFAULT_LOG_LINES

    let profile: DemoLogProfile = resource.fixture.profile
    let seed = resource.fixture.uuid
    if (collection === "services") {
      const name = query.get("sub_service_name")
      const sub = resource.fixture.subResources?.find((item) => item.name === name)
      if (!sub) throw new DemoRequestError(404, "Service container not found.")
      profile = sub.profile
      seed = `${resource.fixture.uuid}:${sub.name}`
    }

    return { logs: runtimeLogs(profile, resource.log, now, limit, seed) }
  }

  private lifecycle(
    connection: DemoConnectionFixture,
    collection: string,
    uuid: string,
    action: "start" | "restart" | "stop",
    now: number
  ) {
    const resource = this.findResource(connection, uuid, collection)
    if (resource.transition) throw new DemoRequestError(409, "An action is already in progress.")

    const running = lifecycleOf(resource.status) === "running"
    if (action === "start" ? running : !running) {
      throw new DemoRequestError(409, `This resource is already ${running ? "running" : "stopped"}.`)
    }

    if (action === "restart") {
      resource.transition = {
        status: "restarting:unknown",
        next: "running:healthy",
        until: now + RESTART_MS,
        action,
      }
      // the old container stops right away and a new one starts once it settles
      resource.log = { ...resource.log, frozenAt: now, ending: "stop" }
    } else if (action === "start") {
      resource.transition = {
        status: "starting:unknown",
        next: "running:healthy",
        until: now + START_MS,
        action,
      }
    } else {
      resource.transition = { status: resource.status, next: "exited", until: now + STOP_MS, action }
    }
    this.changed = true

    const noun = collection === "databases" ? "Database" : collection === "services" ? "Service" : ""
    const verb = action === "start" ? "Starting" : action === "restart" ? "Restart" : "Stopping"
    return { message: `${noun ? `${noun} ${verb.toLowerCase()}` : verb} request queued.` }
  }

  private pinCommit(connection: DemoConnectionFixture, uuid: string, body: Record<string, unknown>) {
    const resource = this.findResource(connection, uuid, "applications")
    const sha = typeof body.git_commit_sha === "string" ? body.git_commit_sha.trim() : ""
    if (sha) resource.pinnedCommit = sha

    return { uuid: resource.fixture.uuid }
  }

  private deploy(connection: DemoConnectionFixture, route: Route, now: number) {
    const uuid = String(route.body.uuid ?? route.query.get("uuid") ?? "").trim()
    if (!uuid) throw new DemoRequestError(400, "You must provide uuid or tag.")

    const resource = this.findResource(connection, uuid, "applications")
    const force = route.body.force === true || route.query.get("force") === "true"
    const deployCount = ++resource.deployCount

    // coolify runs one deployment per application at a time and queues the rest
    const activeEnd = Math.max(
      0,
      ...this.deployments
        .filter((item) => item.resource === resource && !item.settled && item.cancelledAt === null)
        .map((item) => item.endsAt)
    )
    const startsAt = Math.max(now + QUEUE_MS, activeEnd)

    // a rollback deploys the commit it pinned, otherwise a fresh commit lands
    const pinned = resource.pinnedCommit
    const previous = pinned
      ? this.deployments.find((item) => item.resource === resource && item.commit === pinned)
      : undefined
    resource.pinnedCommit = null

    const seed = `${resource.fixture.uuid}:demo:${deployCount}`
    const deployment = this.addDeployment({
      resource,
      uuid: seededId(`deployment:${seed}:${now}`),
      commit: pinned ?? commitSha(`commit:${seed}`),
      commitMessage:
        previous?.commitMessage ??
        DEMO_COMMIT_MESSAGES[(deployCount + resource.fixture.id) % DEMO_COMMIT_MESSAGES.length],
      isWebhook: false,
      isApi: true,
      rollback: pinned !== null,
      forceRebuild: force,
      createdAt: now,
      startsAt,
      endsAt: startsAt + between(32, 55, `duration:${seed}`) * 1_000,
      outcome: "finished",
    })
    this.changed = true

    return {
      deployments: [
        {
          message: `Application ${resource.fixture.name} deployment queued.`,
          resource_uuid: resource.fixture.uuid,
          deployment_uuid: deployment.uuid,
        },
      ],
    }
  }

  private cancel(connection: DemoConnectionFixture, uuid: string, now: number) {
    const deployment = this.findDeployment(connection, uuid)
    if (deployment.settled || deployment.cancelledAt !== null) {
      throw new DemoRequestError(400, "Deployment cannot be cancelled, it has already finished.")
    }

    deployment.cancelledAt = now
    this.changed = true

    return {
      message: "Deployment cancelled successfully.",
      deployment_uuid: uuid,
      status: "cancelled-by-user",
    }
  }

  private deploymentStatus(deployment: DeploymentState, now: number): string {
    if (deployment.cancelledAt !== null && deployment.cancelledAt <= now) return "cancelled-by-user"
    if (now < deployment.startsAt) return "queued"
    if (now < deployment.endsAt) return "in_progress"
    return deployment.outcome
  }

  private deploymentPayload(deployment: DeploymentState, now: number) {
    const { resource } = deployment
    const status = this.deploymentStatus(deployment, now)
    const finishedAt = Math.min(now, deployment.cancelledAt ?? deployment.endsAt)
    const logs = deploymentLogEntries({
      uuid: deployment.uuid,
      repository: resource.fixture.repository ?? resource.fixture.name,
      branch: resource.fixture.branch ?? "main",
      commit: deployment.commit,
      serverName: resource.serverName,
      startsAt: deployment.startsAt,
      endsAt: deployment.endsAt,
      outcome: deployment.outcome,
      cancelledAt: deployment.cancelledAt,
      now,
    })

    return {
      id: deployment.id,
      application_id: String(resource.fixture.id),
      deployment_uuid: deployment.uuid,
      pull_request_id: 0,
      force_rebuild: deployment.forceRebuild,
      commit: deployment.commit,
      status,
      is_webhook: deployment.isWebhook,
      is_api: deployment.isApi,
      created_at: iso(deployment.createdAt),
      updated_at: iso(status === "queued" ? deployment.createdAt : Math.max(deployment.startsAt, finishedAt)),
      logs: JSON.stringify(logs),
      current_process_id: status === "in_progress" ? String(between(1_000, 99_999, deployment.uuid)) : null,
      restart_only: false,
      git_type: null,
      server_id: DEMO_SERVERS.find((server) => server.uuid === resource.fixture.serverUuid)?.id ?? null,
      application_name: resource.fixture.name,
      server_name: resource.serverName,
      deployment_url: `/project/demo/environment/demo/application/${resource.fixture.uuid}/deployment/${deployment.uuid}`,
      destination_id: "1",
      only_this_server: false,
      rollback: deployment.rollback,
      commit_message: deployment.commitMessage,
    }
  }

  private activeDeployments(connection: DemoConnectionFixture, now: number) {
    return this.deployments
      .filter((deployment) => deployment.resource.connection === connection)
      .filter((deployment) => ["queued", "in_progress"].includes(this.deploymentStatus(deployment, now)))
      .map((deployment) => this.deploymentPayload(deployment, now))
  }

  private applicationDeployments(
    connection: DemoConnectionFixture,
    uuid: string,
    query: URLSearchParams,
    now: number
  ) {
    const resource = this.findResource(connection, uuid, "applications")
    const skip = Math.max(0, Number(query.get("skip")) || 0)
    const take = Math.max(1, Number(query.get("take")) || 10)
    const history = this.deployments
      .filter((deployment) => deployment.resource === resource)
      .sort((a, b) => b.createdAt - a.createdAt)

    return {
      count: history.length,
      deployments: history
        .slice(skip, skip + take)
        .map((deployment) => this.deploymentPayload(deployment, now)),
    }
  }

  /**
   * the bridge event a finished deployment produces
   *
   * @param deployment ended deployment
   *
   * @returns the event or null when no bridge watches its connection
   */
  private deploymentEvent(deployment: DeploymentState): BridgeEvent | null {
    const { resource } = deployment
    const bridgeId = resource.connection.bridgeId
    if (!bridgeId) return null

    const succeeded = deployment.outcome === "finished"
    return {
      id: seededId(`event:${deployment.uuid}`),
      bridgeId,
      type: succeeded ? "coolify.deployment_success" : "coolify.deployment_failed",
      severity: succeeded ? "success" : "error",
      title: succeeded ? "Deployment succeeded" : "Deployment failed",
      message: succeeded
        ? `${resource.fixture.name} is live on ${resource.serverName}.`
        : `${resource.fixture.name} could not be deployed. Open the build logs to see why.`,
      resourceType: "application",
      resourceId: resource.fixture.uuid,
      resourceName: resource.fixture.name,
      metadata: {
        connectionId: resource.connection.id,
        deploymentId: `${resource.connection.id}:${deployment.uuid}`,
        deploymentUuid: deployment.uuid,
        resourceUuid: resource.fixture.uuid,
      },
      createdAt: iso(deployment.endsAt),
    }
  }

  /**
   * answer a coolercloud api request
   *
   * @param request method, path below /v1, token and body
   *
   * @returns the response body coolercloud would send
   */
  cloud(request: DemoRequest): unknown {
    const route = parseRoute(request)
    const [collection, id, action, extra, last] = route.segments
    const { method } = route
    const now = this.now()

    if (collection === "auth" && id === "token" && method === "POST") {
      return {
        token: `${DEMO_TOKEN_PREFIX}ccs_${seededId(`session:${now}`)}`,
        expiresAt: iso(now + 30 * 24 * HOUR_MS),
        user: DEMO_USER,
      }
    }

    if (collection === "auth" && id === "logout" && method === "POST") return { loggedOut: true }

    if (collection === "me" && !id) {
      if (method === "GET")
        return { user: DEMO_USER, bridges: this.accountBridges.map((link) => ({ ...link })) }
      // deleting the demo account only resets the demo
      if (method === "DELETE") {
        this.accountBridges = [{ ...DEMO_BRIDGE }]
        return { deleted: true }
      }
    }

    if (collection === "bridges" && id) {
      if (!action && method === "DELETE") {
        this.accountBridges = this.accountBridges.filter((link) => link.cloudBridgeId !== id)
        return { revoked: true }
      }

      if (action === "assertions" && extra === "access" && method === "POST") {
        return { assertion: `${DEMO_TOKEN_PREFIX}access.${id}` }
      }

      if (action === "assertions" && extra === "pair" && !last && method === "POST") {
        const challenge = this.challenges.get(String(route.body.pairingId))
        if (!challenge) throw new DemoRequestError(404, "Pairing request not found.")
        challenge.cloudBridgeId = id
        return { assertion: `${DEMO_TOKEN_PREFIX}pair.${route.body.pairingId}` }
      }

      if (action === "assertions" && extra === "pair" && last === "confirm" && method === "POST") {
        return { paired: this.accountBridges.some((link) => link.cloudBridgeId === id) }
      }
    }

    return notFound()
  }

  /**
   * answer a coolerbridge api request
   *
   * @param baseUrl bridge base url
   * @param request method, path below /v1, token and body
   *
   * @returns the response body the bridge would send
   */
  bridge(baseUrl: string, request: DemoRequest): unknown {
    const route = parseRoute(request)
    const [collection, id, action] = route.segments
    const { method } = route
    const now = this.now()
    this.settle(now)

    if (collection === "pairing" && !id && method === "POST") {
      const pairingId = `${DEMO_TOKEN_PREFIX}pairing_${++this.challengeSequence}`
      const code = seededId(`pairing:${pairingId}:${now}`, 8).toUpperCase()
      this.challenges.set(pairingId, { code, cloudBridgeId: null })
      for (const key of [...this.challenges.keys()].slice(
        0,
        Math.max(0, this.challenges.size - CHALLENGE_LIMIT)
      )) {
        this.challenges.delete(key)
      }

      return { id: pairingId, code, expiresAt: iso(now + 10 * MINUTE_MS) }
    }

    if (collection === "pairing" && id === "complete" && method === "POST") {
      const pairingId = String(route.body.assertion ?? "").replace(`${DEMO_TOKEN_PREFIX}pair.`, "")
      const challenge = this.challenges.get(pairingId)
      if (!challenge || challenge.code !== route.body.code || !challenge.cloudBridgeId) {
        throw new DemoRequestError(400, "Pairing code is invalid or expired.")
      }

      this.challenges.delete(pairingId)
      const cloudBridgeId = challenge.cloudBridgeId
      if (!this.accountBridges.some((link) => link.cloudBridgeId === cloudBridgeId)) {
        this.accountBridges.push({ cloudBridgeId, name: "Coolify", baseUrl })
      }

      return { linked: true, cloudBridgeId }
    }

    if (collection === "auth" && id === "exchange" && method === "POST") {
      return {
        accessToken: `${DEMO_TOKEN_PREFIX}cbt_${seededId(`bridge-session:${now}`)}`,
        tokenType: "Bearer",
        expiresAt: iso(now + HOUR_MS),
        scopes: ["events:read", "devices:read", "devices:write"],
      }
    }

    if (collection === "auth" && id === "me" && method === "GET") {
      return {
        sessionId: seededId(`bridge-me:${route.token}`),
        scopes: ["events:read"],
        expiresAt: iso(now + HOUR_MS),
      }
    }

    if (collection === "auth" && id === "logout" && method === "POST") return { loggedOut: true }

    if (collection === "devices") {
      if (!id && method === "GET") return []

      // no event token, like older bridges, so nothing lands in the shared keychain
      if (!id && method === "POST") {
        const deviceData = (route.body.deviceData ?? {}) as Record<string, unknown>
        return {
          id: seededId(`device:${String(deviceData.pushToken)}`),
          cloudLinkId: seededId(`link:${baseUrl}`),
          platform: deviceData.platform === "android" ? "android" : "ios",
          pushToken: String(deviceData.pushToken ?? ""),
          createdAt: iso(now),
          lastSeenAt: iso(now),
          revokedAt: null,
        }
      }

      if (id && method === "DELETE") return { deviceId: id, deleted: true }
    }

    const bridgeId =
      this.accountBridges.find((link) => link.baseUrl === baseUrl)?.cloudBridgeId ?? DEMO_BRIDGE.cloudBridgeId
    const events = this.events.filter((event) => event.bridgeId === bridgeId)

    if (collection === "events" && method === "GET") {
      if (!id) return [...events].reverse()
      return events.find((event) => event.id === id) ?? notFound()
    }

    if (collection === "push" && id === "events" && action && method === "GET") {
      return events.find((event) => event.id === action) ?? notFound()
    }

    if (collection === "preferences" && method === "PUT") return route.body

    return notFound()
  }
}

/** the coolify api collection a resource type is served from */
const collectionFor = (type: string): "applications" | "databases" | "services" | null => {
  if (type === "application") return "applications"
  if (type === "service") return "services"
  if (type.startsWith("standalone-")) return "databases"
  return null
}

/** whether a raw status means the container runs */
const lifecycleOf = (status: string): "running" | "stopped" => {
  const tokens = status.toLowerCase().split(/[^a-z]+/)
  return tokens.includes("running") || tokens.includes("healthy") ? "running" : "stopped"
}
