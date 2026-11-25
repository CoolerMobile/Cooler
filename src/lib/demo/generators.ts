import type { DemoLogProfile } from "@/lib/demo/fixtures"

// lowercase alphabet coolify uses for its uuids
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

// startup lines are written in a quick burst before the steady stream
const STARTUP_STEP_MS = 200

// shutdown lines are written in a quick burst after the container stops
const ENDING_STEP_MS = 50

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * 32 bit fnv-1a hash with a murmur finalizer
 *
 * the finalizer spreads small input changes across every bit, so seeds that
 * only differ in their last character still look unrelated
 *
 * @param value text to hash
 *
 * @returns unsigned hash
 */
export const hash = (value: string): number => {
  let result = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 0x01000193)
  }

  result ^= result >>> 16
  result = Math.imul(result, 0x85ebca6b)
  result ^= result >>> 13
  result = Math.imul(result, 0xc2b2ae35)
  result ^= result >>> 16

  return result >>> 0
}

/**
 * pick an item deterministically
 *
 * @param items items to pick from
 * @param seed seed text
 *
 * @returns the picked item
 */
export const pick = <T>(items: readonly T[], seed: string): T => items[hash(seed) % items.length]

/**
 * deterministic number in a range
 *
 * @param min lowest value
 * @param max highest value
 * @param seed seed text
 *
 * @returns integer between min and max
 */
export const between = (min: number, max: number, seed: string): number =>
  min + (hash(seed) % (max - min + 1))

/**
 * deterministic coolify style id
 *
 * @param seed seed text
 * @param length id length
 *
 * @returns lowercase alphanumeric id
 */
export const seededId = (seed: string, length = 24): string => {
  let id = ""
  for (let index = 0; id.length < length; index++) {
    id += ID_ALPHABET[hash(`${seed}:${index}`) % ID_ALPHABET.length]
  }

  return id
}

/**
 * deterministic git commit sha
 *
 * @param seed seed text
 *
 * @returns 40 character hex sha
 */
export const commitSha = (seed: string): string => {
  let sha = ""
  for (let index = 0; sha.length < 40; index++) {
    sha += hash(`${seed}:${index}`).toString(16).padStart(8, "0")
  }

  return sha.slice(0, 40)
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0")

/** redis style log date, e.g. 25 Nov 2026 10:00:00.000 */
const redisDate = (time: number) => {
  const date = new Date(time)
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
}

/** nginx style log date, e.g. 25/Nov/2026:10:00:00 +0000 */
const nginxDate = (time: number) => {
  const date = new Date(time)
  return `${pad(date.getUTCDate())}/${MONTHS[date.getUTCMonth()]}/${date.getUTCFullYear()}:${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`
}

/** mariadb style log date, e.g. 2026-11-25 10:00:00 */
const sqlDate = (time: number) => new Date(time).toISOString().slice(0, 19).replace("T", " ")

type ProfileDefinition = {
  /** time between steady lines */
  intervalMs: number
  /** lines written while the container boots */
  startup: string[]
  /** a steady line for a sequence number */
  line: (n: number, seed: string, time: number) => string
  /** lines written when the container stops on request */
  stop: string[]
  /** lines written when the container crashes */
  crash: string[]
  /** text in front of every line */
  prefix?: (time: number) => string
}

const WEB_PATHS = [
  "/",
  "/products/linen-shirt",
  "/products/canvas-tote",
  "/products/wool-beanie",
  "/collections/new",
  "/cart",
  "/checkout",
  "/api/health",
  "/_next/image?url=%2Fimages%2Fhero.jpg&w=1080&q=75",
]

const API_ROUTES = [
  "GET /v1/products",
  "GET /v1/products/linen-shirt",
  "GET /v1/orders?page=2",
  "GET /v1/cart",
  "POST /v1/cart/items",
  "POST /v1/webhooks/stripe",
  "GET /v1/health",
]

const DOCS_PATHS = ["/", "/guides/backups", "/guides/networking", "/reference/cli", "/assets/main.css"]

const KUMA_MONITORS = ["Storefront", "Storefront API", "Docs", "Nextcloud", "Home Assistant", "Router"]

const WORKER_QUEUES = ["payouts", "emails", "invoices"]

const PROFILES: Record<DemoLogProfile, ProfileDefinition> = {
  web: {
    intervalMs: 3_500,
    startup: [
      "> storefront@1.8.0 start",
      "> next start -p 3000",
      "  ▲ Next.js 15.3.1",
      "  - Local:   http://localhost:3000",
      " ✓ Ready in 418ms",
    ],
    line: (n, seed) => {
      const path = pick(WEB_PATHS, `${seed}:path:${n}`)
      const status = between(0, 30, `${seed}:status:${n}`) === 0 ? 404 : 200
      return `GET ${path} ${status} in ${between(8, 180, `${seed}:ms:${n}`)}ms`
    },
    stop: ["Received SIGTERM, closing server", "Server closed"],
    crash: ["Error: listen EADDRINUSE: address already in use :::3000"],
  },
  api: {
    intervalMs: 2_500,
    startup: [
      "[api] loading configuration from environment",
      "[api] connected to postgres at storefront-db:5432",
      "[api] connected to redis at storefront-cache:6379",
      "[api] listening on http://0.0.0.0:8080",
    ],
    line: (n, seed) => {
      const route = pick(API_ROUTES, `${seed}:route:${n}`)
      const status = route.startsWith("POST") ? 201 : 200
      return `[api] ${route} ${status} ${between(3, 95, `${seed}:ms:${n}`)}ms`
    },
    stop: ["[api] received SIGTERM, draining connections", "[api] shutdown complete"],
    crash: ["[api] fatal: unhandled promise rejection"],
  },
  worker: {
    intervalMs: 6_000,
    startup: [
      "[worker] starting checkout-worker v2.4.0",
      "[worker] connected to redis at storefront-cache:6379",
      "[worker] watching queues: payouts, emails, invoices",
    ],
    line: (n, seed) => {
      const queue = pick(WORKER_QUEUES, `${seed}:queue:${n}`)
      if (n % 5 === 0) return `[worker] ${queue}: ${between(0, 6, `${seed}:waiting:${n}`)} jobs waiting`
      return `[worker] processed ${queue}:${between(10_000, 99_999, `${seed}:job:${n}`)} in ${between(40, 900, `${seed}:ms:${n}`)}ms`
    },
    stop: ["[worker] received SIGTERM, finishing current jobs", "[worker] shutdown complete"],
    crash: [
      "[worker] lost connection to redis, retrying (5/5)",
      "Error: connect ECONNREFUSED 10.0.1.12:6380",
      "    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1611:16)",
      "[worker] fatal: could not reach the job queue, exiting with code 1",
    ],
  },
  static: {
    intervalMs: 9_000,
    startup: [
      "/docker-entrypoint.sh: Configuration complete; ready for start up",
      "[notice] 1#1: nginx/1.27.3",
      "[notice] 1#1: start worker processes",
    ],
    line: (n, seed, time) =>
      `192.168.1.${between(2, 60, `${seed}:ip:${n}`)} - - [${nginxDate(time)}] "GET ${pick(DOCS_PATHS, `${seed}:path:${n}`)} HTTP/1.1" 200 ${between(900, 48_000, `${seed}:bytes:${n}`)} "-" "Mozilla/5.0"`,
    stop: ["[notice] 1#1: signal 3 (SIGQUIT) received, shutting down", "[notice] 1#1: exit"],
    crash: ["[emerg] 1#1: host not found in upstream"],
  },
  postgres: {
    intervalMs: 30_000,
    startup: [
      "PostgreSQL Database directory appears to contain a database; Skipping initialization",
      "LOG:  starting PostgreSQL 16.4 on x86_64-pc-linux-musl, 64-bit",
      'LOG:  listening on IPv4 address "0.0.0.0", port 5432',
      "LOG:  database system is ready to accept connections",
    ],
    line: (n, seed) => {
      if (n % 3 === 0) return "LOG:  checkpoint starting: time"
      if (n % 3 === 1) {
        const buffers = between(4, 220, `${seed}:buffers:${n}`)
        return `LOG:  checkpoint complete: wrote ${buffers} buffers (${(buffers / 160).toFixed(1)}%); 0 WAL file(s) added, 0 removed, 1 recycled`
      }
      return `LOG:  automatic vacuum of table "app.public.${pick(["orders", "sessions", "events", "carts"], `${seed}:table:${n}`)}": index scans: 1`
    },
    stop: ["LOG:  received fast shutdown request", "LOG:  database system is shut down"],
    crash: ["FATAL:  could not write to file: No space left on device"],
  },
  redis: {
    intervalMs: 15_000,
    startup: [
      "Redis version=7.2.5, bits=64, pid=1, just started",
      "Server initialized",
      "Ready to accept connections tcp",
    ],
    line: (n, seed) =>
      [
        "100 changes in 300 seconds. Saving...",
        `Background saving started by pid ${between(20, 900, `${seed}:pid:${n}`)}`,
        "DB saved on disk",
        "Background saving terminated with success",
      ][n % 4],
    stop: ["User requested shutdown...", "Redis is now ready to exit, bye bye..."],
    crash: ["Out Of Memory allocating 1048576 bytes!"],
    prefix: (time) => `1:M ${redisDate(time)} * `,
  },
  mariadb: {
    intervalMs: 45_000,
    startup: [
      "[Note] Starting MariaDB 11.4.4 as process 1",
      "[Note] InnoDB: Buffer pool(s) load completed",
      "[Note] mariadbd: ready for connections.",
    ],
    line: (n, seed) =>
      n % 4 === 0
        ? "[Note] InnoDB: Buffer pool(s) dump completed"
        : `[Warning] Aborted connection ${between(100, 9_999, `${seed}:id:${n}`)} to db: 'nextcloud' user: 'nextcloud' host: '172.18.0.${between(2, 9, `${seed}:host:${n}`)}' (Got timeout reading communication packets)`,
    stop: ["[Note] mariadbd (initiated by: unknown): Normal shutdown", "[Note] mariadbd: Shutdown complete"],
    crash: ["[ERROR] mariadbd got signal 11"],
    prefix: (time) => `${sqlDate(time)} 0 `,
  },
  clickhouse: {
    intervalMs: 5_000,
    startup: [
      "<Information> Application: Starting ClickHouse 24.3.3.102",
      "<Information> Application: Ready for connections.",
    ],
    line: (n, seed) => {
      const rows = between(200, 90_000, `${seed}:rows:${n}`)
      return `<Information> executeQuery: Read ${rows} rows, ${Math.ceil(rows / 24)} KiB in 0.0${between(10, 99, `${seed}:ms:${n}`)} sec.`
    },
    stop: [
      "<Information> Application: Received termination signal (Terminated)",
      "<Information> Application: Shut down",
    ],
    crash: ["<Fatal> BaseDaemon: Received signal 11"],
  },
  plausible: {
    intervalMs: 2_000,
    startup: [
      "Loading plausible..",
      "Starting migrations..",
      "Migrations successful!",
      "Running PlausibleWeb.Endpoint with Bandit 1.5.7 at :::8000 (http)",
    ],
    line: (n, seed) =>
      n % 2 === 0
        ? "[info] POST /api/event"
        : `[info] Sent 202 in ${between(300, 2_400, `${seed}:us:${n}`)}µs`,
    stop: ["[notice] SIGTERM received - shutting down"],
    crash: ["[error] Postgrex.Protocol failed to connect"],
  },
  kuma: {
    intervalMs: 12_000,
    startup: ["Welcome to Uptime Kuma", "Your Node.js version: 20.18.1", "[SERVER] INFO: Listening on 3001"],
    line: (n, seed) => {
      const monitor = between(1, KUMA_MONITORS.length, `${seed}:monitor:${n}`)
      return `[MONITOR] INFO: Monitor #${monitor} '${KUMA_MONITORS[monitor - 1]}': Successful Response: ${between(12, 340, `${seed}:ms:${n}`)} ms | Interval: 60 seconds | Type: http`
    },
    stop: ["[SERVER] INFO: Shutdown requested", "[SERVER] INFO: Graceful shutdown successful!"],
    crash: ["[SERVER] ERROR: Failed to start, database is locked"],
  },
}

/** one container run that writes runtime logs */
export type DemoLogSegment = {
  /** when the container started */
  anchor: number
  /** shifts the generated content so every run reads differently */
  offset: number
  /** when the container stopped writing, null while it runs */
  frozenAt: number | null
  /** how the container stopped */
  ending: "crash" | "stop" | null
}

/**
 * time a line was written
 *
 * @param profile log profile
 * @param anchor container start
 * @param index line index within the run
 *
 * @returns unix ms timestamp
 */
const lineTime = (profile: ProfileDefinition, anchor: number, index: number): number =>
  index < profile.startup.length
    ? anchor + index * STARTUP_STEP_MS
    : anchor +
      profile.startup.length * STARTUP_STEP_MS +
      (index - profile.startup.length + 1) * profile.intervalMs

/**
 * number of lines a run has written by a point in time
 *
 * @param profile log profile
 * @param anchor container start
 * @param end point in time
 *
 * @returns line count
 */
const lineCount = (profile: ProfileDefinition, anchor: number, end: number): number => {
  if (end < anchor) return 0

  const startupCount = Math.min(profile.startup.length, Math.floor((end - anchor) / STARTUP_STEP_MS) + 1)
  if (startupCount < profile.startup.length) return startupCount

  const steady = Math.floor((end - anchor - profile.startup.length * STARTUP_STEP_MS) / profile.intervalMs)
  return profile.startup.length + Math.max(0, steady)
}

/**
 * render the tail of a container run as coolify returns it with timestamps
 *
 * lines are a pure function of the run and the time, so polling returns new
 * lines as time passes without keeping anything in memory
 *
 * @param profileName log profile
 * @param segment container run
 * @param now current time
 * @param limit max lines to return
 * @param seed seed text for the generated content
 *
 * @returns newline separated log text
 */
export const runtimeLogs = (
  profileName: DemoLogProfile,
  segment: DemoLogSegment,
  now: number,
  limit: number,
  seed: string
): string => {
  const profile = PROFILES[profileName]
  const end = Math.min(now, segment.frozenAt ?? now)
  const total = lineCount(profile, segment.anchor, end)
  const ending =
    segment.frozenAt !== null && segment.frozenAt <= now && segment.ending
      ? profile[segment.ending].filter((_, index) => segment.frozenAt! + index * ENDING_STEP_MS <= now)
      : []

  const lines: string[] = []
  const firstIndex = Math.max(0, total - Math.max(0, limit - ending.length))
  for (let index = firstIndex; index < total; index++) {
    const time = lineTime(profile, segment.anchor, index)
    const text =
      index < profile.startup.length
        ? profile.startup[index]
        : profile.line(segment.offset + index, seed, time)
    lines.push(`${new Date(time).toISOString()} ${profile.prefix?.(time) ?? ""}${text}`)
  }

  ending.forEach((text, index) => {
    const time = segment.frozenAt! + index * ENDING_STEP_MS
    lines.push(`${new Date(time).toISOString()} ${profile.prefix?.(time) ?? ""}${text}`)
  })

  return lines.slice(-limit).join("\n")
}

/** a coolify deployment log entry */
export type DemoDeploymentLogEntry = {
  command: string | null
  output: string
  type: "stdout" | "stderr"
  timestamp: string
  hidden: boolean
  batch: number
}

/**
 * build log of a deployment up to a point in time
 *
 * @param input deployment details and timing
 *
 * @returns entries written so far
 */
export const deploymentLogEntries = (input: {
  uuid: string
  repository: string
  branch: string
  commit: string
  serverName: string
  startsAt: number
  endsAt: number
  outcome: "finished" | "failed"
  cancelledAt: number | null
  now: number
}): DemoDeploymentLogEntry[] => {
  const { uuid, repository, branch, commit, serverName, startsAt, endsAt, outcome, cancelledAt, now } = input
  const image = `${repository.split("/").pop()}:${commit}`

  const steps: [number, string, "stdout" | "stderr"][] = [
    [0, `Starting deployment of ${repository}:${branch} to ${serverName}.`, "stdout"],
    [0.02, "Preparing container with helper image: ghcr.io/coollabsio/coolify-helper:1.0.8.", "stdout"],
    [0.06, `Importing ${repository}:${branch} (commit sha ${commit}) to /artifacts/${uuid}.`, "stdout"],
    [0.12, `Image not found (${image}). Building new image.`, "stdout"],
    [0.18, "Generating nixpacks configuration with: nixpacks plan -f toml", "stdout"],
    [0.25, "Building docker image started.", "stdout"],
    [0.32, "#6 [stage-0  4/11] COPY package.json package-lock.json ./", "stdout"],
    [0.38, "#7 [stage-0  5/11] RUN npm ci", "stdout"],
    [0.47, "#7 added 612 packages, and audited 613 packages in 14s", "stdout"],
    [0.52, "#9 [stage-0  7/11] RUN npm run build", "stdout"],
  ]

  if (outcome === "failed") {
    steps.push(
      [0.6, "#9 build completed with warnings", "stdout"],
      [0.66, "Building docker image completed.", "stdout"],
      [0.72, "Rolling update started.", "stdout"],
      [0.8, "New container started.", "stdout"],
      [0.88, "Healthcheck failed: container exited with code 1.", "stderr"],
      [0.95, "New container is not healthy, rolling back.", "stderr"],
      [1, "Deployment failed. Removing the new version of your application.", "stderr"]
    )
  } else {
    steps.push(
      [0.64, "#9 build completed in 38.2s", "stdout"],
      [0.7, "#12 exporting to image", "stdout"],
      [0.76, "Building docker image completed.", "stdout"],
      [0.82, "Rolling update started.", "stdout"],
      [0.88, "New container started.", "stdout"],
      [0.94, "Custom healthcheck found, running it.", "stdout"],
      [0.97, "Healthcheck passed.", "stdout"],
      [1, "Rolling update completed.", "stdout"]
    )
  }

  const visibleUntil = Math.min(now, cancelledAt ?? endsAt)
  const entries = steps
    .map(([fraction, output, type]) => ({ time: startsAt + fraction * (endsAt - startsAt), output, type }))
    .filter(({ time }) => time <= visibleUntil)
    .map<DemoDeploymentLogEntry>(({ time, output, type }, index) => ({
      command: null,
      output,
      type,
      timestamp: new Date(time).toISOString(),
      hidden: false,
      batch: index + 1,
    }))

  if (cancelledAt !== null && cancelledAt <= now) {
    entries.push({
      command: null,
      output: "Deployment cancelled by user.",
      type: "stderr",
      timestamp: new Date(cancelledAt).toISOString(),
      hidden: false,
      batch: entries.length + 1,
    })
  }

  return entries
}
