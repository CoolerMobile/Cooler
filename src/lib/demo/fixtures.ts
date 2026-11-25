/** every demo host ends with this reserved tld, so it can never resolve */
export const DEMO_HOST_SUFFIX = ".demo.invalid"

/** prefix shared by every token the demo hands out */
export const DEMO_TOKEN_PREFIX = "demo_"

/** sign in code that signs into the demo account */
export const DEMO_SIGN_IN_CODE = "demo"

/** coolify version every demo connection reports */
export const DEMO_COOLIFY_VERSION = "4.0.0-beta.460"

/** cloud id of the bridge paired to the demo account */
export const DEMO_BRIDGE_ID = "demo-bridge-production"

/** public url of the demo bridge */
export const DEMO_BRIDGE_URL = "https://bridge.demo.invalid"

/** identity of the demo account */
export const DEMO_USER = { id: "demo-user", email: "demo@getcooler.app", name: "Demo account" }

/** the bridge linked to the demo account */
export const DEMO_BRIDGE = { cloudBridgeId: DEMO_BRIDGE_ID, name: "Production", baseUrl: DEMO_BRIDGE_URL }

/** a saved coolify connection */
export type DemoConnectionFixture = {
  id: string
  nickname: string
  endpoint: string
  /** bridge that delivers this connection's events, if any */
  bridgeId: string | null
}

/** a coolify deployment server */
export type DemoServerFixture = {
  id: number
  uuid: string
  connectionId: string
  name: string
  description: string
  ip: string
}

/** a coolify project with its environments */
export type DemoProjectFixture = {
  id: number
  uuid: string
  connectionId: string
  name: string
  description: string
  environments: { id: number; name: string }[]
}

/** runtime log style a container writes */
export type DemoLogProfile =
  "web" | "api" | "worker" | "static" | "postgres" | "redis" | "mariadb" | "clickhouse" | "plausible" | "kuma"

/** a container inside a coolify service */
export type DemoSubResourceFixture = {
  name: string
  kind: "application" | "database"
  image: string
  profile: DemoLogProfile
}

/** a seeded deployment, timed relative to when the demo starts */
export type DemoDeploymentSeed = {
  minutesAgo: number
  durationSeconds: number
  outcome: "finished" | "failed" | "in_progress"
  commitMessage: string
  trigger: "webhook" | "api" | "manual"
}

/** an application, database or service */
export type DemoResourceFixture = {
  id: number
  uuid: string
  name: string
  type: string
  serverUuid: string
  environmentId: number
  status: string
  profile: DemoLogProfile
  /** how long the current container has been up */
  uptimeHours: number
  /** when a stopped resource exited */
  exitedMinutesAgo?: number
  repository?: string
  branch?: string
  subResources?: DemoSubResourceFixture[]
  deployments?: DemoDeploymentSeed[]
}

export const DEMO_CONNECTIONS: DemoConnectionFixture[] = [
  {
    id: "demo-production",
    nickname: "Production",
    endpoint: "https://coolify.demo.invalid",
    bridgeId: DEMO_BRIDGE_ID,
  },
  {
    id: "demo-homelab",
    nickname: "Homelab",
    endpoint: "https://homelab.demo.invalid",
    bridgeId: null,
  },
]

export const DEMO_SERVERS: DemoServerFixture[] = [
  {
    id: 1,
    uuid: "k8w4s0cg8ok4c0w8kgss4wcc",
    connectionId: "demo-production",
    name: "app-fsn1",
    description: "Hetzner CX32 · Falkenstein",
    ip: "10.0.1.10",
  },
  {
    id: 2,
    uuid: "m4kocs0gw8swc8ko4k0gcwg0",
    connectionId: "demo-production",
    name: "db-fsn1",
    description: "Hetzner CX22 · Databases",
    ip: "10.0.1.12",
  },
  {
    id: 1,
    uuid: "q0gso4kwwc8gk4s8o0wkc8sc",
    connectionId: "demo-homelab",
    name: "homelab",
    description: "Mini PC in the closet",
    ip: "192.168.1.20",
  },
]

export const DEMO_PROJECTS: DemoProjectFixture[] = [
  {
    id: 1,
    uuid: "c4o8wk0s4gg8kc0w4s8k0kgo",
    connectionId: "demo-production",
    name: "Storefront",
    description: "Shop, api and background jobs",
    environments: [
      { id: 11, name: "production" },
      { id: 12, name: "staging" },
    ],
  },
  {
    id: 2,
    uuid: "w8cgs4k0o0kcw4g8sk4ocw0s",
    connectionId: "demo-production",
    name: "Analytics",
    description: "Privacy friendly web analytics",
    environments: [{ id: 13, name: "production" }],
  },
  {
    id: 1,
    uuid: "g0k4wc8os4wkg8c0os4gk8wc",
    connectionId: "demo-homelab",
    name: "Home",
    description: "Self hosted services at home",
    environments: [{ id: 21, name: "production" }],
  },
]

export const DEMO_RESOURCES: DemoResourceFixture[] = [
  {
    id: 1,
    uuid: "s0wk4cg8kc8o4gsw0kogc4s8",
    name: "storefront-web",
    type: "application",
    serverUuid: "k8w4s0cg8ok4c0w8kgss4wcc",
    environmentId: 11,
    status: "running:healthy",
    profile: "web",
    uptimeHours: 0.6,
    repository: "acme/storefront-web",
    branch: "main",
    deployments: [
      {
        minutesAgo: 2_880,
        durationSeconds: 142,
        outcome: "finished",
        commitMessage: "feat: add gift card checkout",
        trigger: "webhook",
      },
      {
        minutesAgo: 1_560,
        durationSeconds: 128,
        outcome: "finished",
        commitMessage: "fix: cart badge count on mobile",
        trigger: "webhook",
      },
      {
        minutesAgo: 190,
        durationSeconds: 151,
        outcome: "finished",
        commitMessage: "chore: bump next to 15.3",
        trigger: "webhook",
      },
      {
        minutesAgo: 38,
        durationSeconds: 136,
        outcome: "finished",
        commitMessage: "feat: show delivery estimate on product page",
        trigger: "webhook",
      },
    ],
  },
  {
    id: 2,
    uuid: "a4ckg0s8ww4ko8cg0sk4wgc8",
    name: "storefront-api",
    type: "application",
    serverUuid: "k8w4s0cg8ok4c0w8kgss4wcc",
    environmentId: 11,
    status: "running:healthy",
    profile: "api",
    uptimeHours: 5,
    repository: "acme/storefront-api",
    branch: "main",
    deployments: [
      {
        minutesAgo: 1_440,
        durationSeconds: 96,
        outcome: "finished",
        commitMessage: "feat: rate limit public endpoints",
        trigger: "webhook",
      },
      {
        minutesAgo: 302,
        durationSeconds: 88,
        outcome: "finished",
        commitMessage: "fix: paginate order history",
        trigger: "api",
      },
      {
        minutesAgo: 0.6,
        durationSeconds: 95,
        outcome: "in_progress",
        commitMessage: "feat: retry webhooks with backoff",
        trigger: "webhook",
      },
    ],
  },
  {
    id: 3,
    uuid: "o8sw0kc4gk4wcs8g0ko8sw4c",
    name: "checkout-worker",
    type: "application",
    serverUuid: "k8w4s0cg8ok4c0w8kgss4wcc",
    environmentId: 11,
    status: "exited:unhealthy",
    profile: "worker",
    uptimeHours: 30,
    exitedMinutesAgo: 362,
    repository: "acme/checkout-worker",
    branch: "main",
    deployments: [
      {
        minutesAgo: 2_000,
        durationSeconds: 74,
        outcome: "finished",
        commitMessage: "feat: retry failed payouts",
        trigger: "webhook",
      },
      {
        minutesAgo: 365,
        durationSeconds: 61,
        outcome: "failed",
        commitMessage: "feat: move job queue to redis streams",
        trigger: "webhook",
      },
    ],
  },
  {
    id: 4,
    uuid: "e0g8kw4scg0ow8k4c4gws0ok",
    name: "storefront-preview",
    type: "application",
    serverUuid: "k8w4s0cg8ok4c0w8kgss4wcc",
    environmentId: 12,
    status: "running:healthy",
    profile: "web",
    uptimeHours: 12,
    repository: "acme/storefront-web",
    branch: "staging",
    deployments: [
      {
        minutesAgo: 720,
        durationSeconds: 133,
        outcome: "finished",
        commitMessage: "feat: preview gift card flow",
        trigger: "webhook",
      },
    ],
  },
  {
    id: 1,
    uuid: "i4wg0so8kc4k8gw0csk8og4w",
    name: "plausible",
    type: "service",
    serverUuid: "k8w4s0cg8ok4c0w8kgss4wcc",
    environmentId: 13,
    status: "running:healthy",
    profile: "plausible",
    uptimeHours: 200,
    subResources: [
      {
        name: "plausible",
        kind: "application",
        image: "ghcr.io/plausible/community-edition:v2.1.4",
        profile: "plausible",
      },
      {
        name: "plausible-events-db",
        kind: "database",
        image: "clickhouse/clickhouse-server:24.3.3.102-alpine",
        profile: "clickhouse",
      },
      { name: "plausible-db", kind: "database", image: "postgres:16-alpine", profile: "postgres" },
    ],
  },
  {
    id: 1,
    uuid: "u8kc4wgo0s8gk4cw0ogs4k8w",
    name: "storefront-db",
    type: "standalone-postgresql",
    serverUuid: "m4kocs0gw8swc8ko4k0gcwg0",
    environmentId: 11,
    status: "running:healthy",
    profile: "postgres",
    uptimeHours: 320,
  },
  {
    id: 2,
    uuid: "y0cs8kg4wo4gc0k8sw8okg4c",
    name: "storefront-cache",
    type: "standalone-redis",
    serverUuid: "m4kocs0gw8swc8ko4k0gcwg0",
    environmentId: 11,
    status: "running:healthy",
    profile: "redis",
    uptimeHours: 320,
  },
  {
    id: 1,
    uuid: "h8go4wc0ks4k8cgw0so8kc4g",
    name: "uptime-kuma",
    type: "service",
    serverUuid: "q0gso4kwwc8gk4s8o0wkc8sc",
    environmentId: 21,
    status: "running:healthy",
    profile: "kuma",
    uptimeHours: 140,
    subResources: [
      { name: "uptime-kuma", kind: "application", image: "louislam/uptime-kuma:1.23.16", profile: "kuma" },
    ],
  },
  {
    id: 2,
    uuid: "n0wk8sc4go8kw0gc4s4kog8w",
    name: "docs-site",
    type: "application",
    serverUuid: "q0gso4kwwc8gk4s8o0wkc8sc",
    environmentId: 21,
    status: "running:healthy",
    profile: "static",
    uptimeHours: 1.5,
    repository: "acme/docs",
    branch: "main",
    deployments: [
      {
        minutesAgo: 4_320,
        durationSeconds: 58,
        outcome: "finished",
        commitMessage: "docs: add backup guide",
        trigger: "webhook",
      },
      {
        minutesAgo: 95,
        durationSeconds: 52,
        outcome: "finished",
        commitMessage: "docs: fix broken links",
        trigger: "manual",
      },
    ],
  },
  {
    id: 3,
    uuid: "t4og8cw0kk4sg8wc0o4kgs8w",
    name: "nextcloud-db",
    type: "standalone-mariadb",
    serverUuid: "q0gso4kwwc8gk4s8o0wkc8sc",
    environmentId: 21,
    status: "running:healthy",
    profile: "mariadb",
    uptimeHours: 140,
  },
]

/** commit messages rotated through for deployments started in the demo */
export const DEMO_COMMIT_MESSAGES = [
  "fix: handle empty carts gracefully",
  "feat: add order export",
  "chore: update dependencies",
  "perf: cache product listings",
  "fix: timezone in receipts",
  "feat: dark mode for emails",
]

/**
 * whether a url points at a demo host
 *
 * @param url absolute url
 *
 * @returns true for demo hosts
 */
export const isDemoEndpoint = (url: string | null | undefined): boolean => {
  if (!url) return false

  try {
    return new URL(url).hostname.toLowerCase().endsWith(DEMO_HOST_SUFFIX)
  } catch {
    return false
  }
}

/**
 * whether a token was handed out by the demo
 *
 * @param token bearer token
 *
 * @returns true for demo tokens
 */
export const isDemoToken = (token: string | null | undefined): boolean =>
  typeof token === "string" && token.startsWith(DEMO_TOKEN_PREFIX)

/**
 * whether a saved connection id belongs to the demo
 *
 * @param id connection id
 *
 * @returns true for demo connections
 */
export const isDemoConnectionId = (id: string | null | undefined): boolean =>
  DEMO_CONNECTIONS.some((connection) => connection.id === id)
