import type { ResourceStatus } from "@/lib/types/coolify"

/** Converts the status formats returned by different Coolify versions. */
export const normalizeResourceStatus = (status: unknown): ResourceStatus => {
  if (typeof status !== "string" || status.trim().length === 0) return "unknown"

  const tokens = status
    .toLowerCase()
    .trim()
    .split(/[^a-z]+/)
    .filter(Boolean)

  if (tokens.some((token) => ["failed", "dead", "degraded", "unhealthy"].includes(token))) {
    return "failed"
  }

  if (tokens.some((token) => ["stopped", "exited", "paused"].includes(token))) {
    return "stopped"
  }

  // Coolify has returned all of `running`, `running:healthy`,
  // `running (healthy)`, and occasionally just `healthy` across versions.
  if (tokens.includes("running") || tokens.includes("healthy")) return "running"

  return "unknown"
}
