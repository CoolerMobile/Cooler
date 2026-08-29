import type { Deployment, DeploymentStatus } from "@/lib/types/deployment"

export type DeploymentStageStatus = "complete" | "current" | "failed" | "unreached"

export type DeploymentStage = {
  name: string
  status: DeploymentStageStatus
  duration: number | null
  detail: string | null
}

const STAGE_NAMES = ["Queued", "Cloning", "Building", "Deploying", "Health check", "Finished"] as const

const stageIndexFromLogs = (logs: string): number => {
  const lower = logs.toLowerCase()
  if (/health.?check|waiting for.*healthy/.test(lower)) return 4
  if (/rolling|starting.*container|deploying|new container/.test(lower)) return 3
  if (/docker build|building|nixpacks|build pack|build image/.test(lower)) return 2
  if (/cloning|git clone|checking out|repository/.test(lower)) return 1
  return 0
}

const failureDetail = (logs: string): string | null => {
  const lines = logs
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const explicit = [...lines].reverse().find((line) => /error|failed|unhealthy|timed out/i.test(line))
  if (!explicit) return "Coolify reported that this stage failed. Open the logs below for details."
  return explicit.replace(/^\d{4}[^ ]*\s+/, "").slice(0, 240)
}

export const deploymentStages = (deployment: Deployment): DeploymentStage[] => {
  const elapsed = Math.max(0, deployment.updatedAt - deployment.createdAt)
  let currentIndex = stageIndexFromLogs(deployment.logs)
  if (deployment.status === "queued") currentIndex = 0
  if (deployment.status === "success") currentIndex = STAGE_NAMES.length - 1
  if (deployment.status === "failed" && currentIndex === 0) currentIndex = 2
  if (deployment.status === "cancelled") currentIndex = Math.max(0, currentIndex)

  const reachedCount = deployment.status === "success" ? STAGE_NAMES.length : currentIndex + 1
  const stageDuration = reachedCount > 0 ? Math.floor(elapsed / reachedCount) : null

  return STAGE_NAMES.map((name, index) => {
    let stageStatus: DeploymentStageStatus = "unreached"
    if (deployment.status === "success") stageStatus = "complete"
    else if (deployment.status === "failed" && index === currentIndex) stageStatus = "failed"
    else if (deployment.status === "cancelled" && index === currentIndex) stageStatus = "failed"
    else if (index < currentIndex) stageStatus = "complete"
    else if (index === currentIndex && ["queued", "running"].includes(deployment.status))
      stageStatus = "current"

    return {
      name,
      status: stageStatus,
      duration:
        stageStatus === "complete"
          ? stageDuration
          : stageStatus === "current" || stageStatus === "failed"
            ? elapsed - (stageDuration ?? 0) * currentIndex
            : null,
      detail: stageStatus === "failed" ? failureDetail(deployment.logs) : null,
    }
  })
}

export const formatDuration = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  if (minutes < 60) return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export const deploymentDuration = (deployment: Deployment, now = Date.now()): string =>
  formatDuration(
    (["queued", "running"] as DeploymentStatus[]).includes(deployment.status)
      ? now - deployment.createdAt
      : deployment.updatedAt - deployment.createdAt
  )

export const shortCommit = (commit: string | null): string => commit?.slice(0, 7) || "No commit"
