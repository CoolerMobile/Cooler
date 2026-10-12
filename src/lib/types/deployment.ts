export type DeploymentStatus = "queued" | "running" | "success" | "failed" | "cancelled"

export type DeploymentTrigger = "webhook" | "api" | "manual" | "rollback"

export type Deployment = {
  id: string
  uuid: string
  connectionId: string
  resourceUuid: string | null
  resourceName: string
  projectName: string | null
  environmentName: string | null
  serverName: string
  status: DeploymentStatus
  commit: string | null
  commitMessage: string | null
  trigger: DeploymentTrigger
  createdAt: number
  updatedAt: number
  logs: string
  /** Whether Coolify included its sensitive deployment-log field in the response. */
  logsAvailable: boolean
  isRollback: boolean
}

export type DeploymentStatusFilter = "all" | "running" | "failed" | "success"

export type DeploymentFilters = {
  query: string
  status: DeploymentStatusFilter
  server: string | null
  project: string | null
  resource: string | null
}
