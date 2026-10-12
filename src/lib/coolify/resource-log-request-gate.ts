import AsyncStorage from "@react-native-async-storage/async-storage"

export const RESOURCE_LOG_SUCCESS_COOLDOWN_MS = 30_000
export const RESOURCE_LOG_HTTP_ERROR_COOLDOWN_MS = 60_000
export const RESOURCE_LOG_FIRST_UNCERTAIN_COOLDOWN_MS = 2 * 60_000
export const RESOURCE_LOG_SECOND_UNCERTAIN_COOLDOWN_MS = 10 * 60_000
export const RESOURCE_LOG_REPEATED_UNCERTAIN_COOLDOWN_MS = 60 * 60_000

const STORAGE_PREFIX = "cooler:resource-log-request-blocked-until:"

export type ResourceLogRequestOutcome = "success" | "http-error" | "uncertain"

type RequestGateStorage = Pick<typeof AsyncStorage, "getItem" | "setItem">

type ResourceLogRequestState = {
  active: boolean
  blockedUntil: number
  uncertainFailures: number
}

type StoredResourceLogRequestState = Omit<ResourceLogRequestState, "active">

export type ResourceLogRequestLease = {
  blockedUntil: number
  complete: (outcome: ResourceLogRequestOutcome) => Promise<number>
}

export type ResourceLogRequestAcquisition =
  { acquired: false; blockedUntil: number } | { acquired: true; lease: ResourceLogRequestLease }

const emptyStoredState = (): StoredResourceLogRequestState => ({ blockedUntil: 0, uncertainFailures: 0 })

const storedState = (value: string | null): StoredResourceLogRequestState => {
  if (!value) return emptyStoredState()

  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== "object") throw new TypeError("Legacy stored timestamp")

    const candidate = parsed as Partial<StoredResourceLogRequestState>
    const blockedUntil = Number(candidate.blockedUntil)
    const uncertainFailures = Number(candidate.uncertainFailures)
    return {
      blockedUntil: Number.isFinite(blockedUntil) && blockedUntil > 0 ? blockedUntil : 0,
      uncertainFailures: Number.isInteger(uncertainFailures) && uncertainFailures > 0 ? uncertainFailures : 0,
    }
  } catch {
    // Versions before the escalating breaker stored the timestamp by itself.
    const blockedUntil = Number(value)
    return {
      blockedUntil: Number.isFinite(blockedUntil) && blockedUntil > 0 ? blockedUntil : 0,
      uncertainFailures: 0,
    }
  }
}

const uncertainCooldown = (uncertainFailures: number): number => {
  if (uncertainFailures <= 1) return RESOURCE_LOG_FIRST_UNCERTAIN_COOLDOWN_MS
  if (uncertainFailures === 2) return RESOURCE_LOG_SECOND_UNCERTAIN_COOLDOWN_MS
  return RESOURCE_LOG_REPEATED_UNCERTAIN_COOLDOWN_MS
}

const outcomeCooldown = (outcome: ResourceLogRequestOutcome, uncertainFailures: number): number => {
  if (outcome === "success") return RESOURCE_LOG_SUCCESS_COOLDOWN_MS
  if (outcome === "http-error") return RESOURCE_LOG_HTTP_ERROR_COOLDOWN_MS
  return uncertainCooldown(uncertainFailures)
}

/**
 * Serializes runtime-log requests across every mounted screen and persists a
 * circuit breaker across app restarts. Acquiring a lease immediately records an
 * uncertain attempt so a crash or disconnect cannot trigger a request storm.
 * Consecutive uncertain results back off for 2 minutes, 10 minutes, then 1 hour.
 */
export class ResourceLogRequestGate {
  private readonly states = new Map<string, ResourceLogRequestState>()

  constructor(
    private readonly storage: RequestGateStorage,
    private readonly now: () => number = Date.now
  ) {}

  private storageKey(resourceId: string): string {
    return `${STORAGE_PREFIX}${resourceId}`
  }

  private async persistedState(resourceId: string): Promise<StoredResourceLogRequestState> {
    try {
      return storedState(await this.storage.getItem(this.storageKey(resourceId)))
    } catch {
      return emptyStoredState()
    }
  }

  private async persistState(resourceId: string, state: StoredResourceLogRequestState): Promise<void> {
    try {
      await this.storage.setItem(this.storageKey(resourceId), JSON.stringify(state))
    } catch {
      // The in-memory guard remains active even if device persistence is unavailable.
    }
  }

  async getBlockedUntil(resourceId: string): Promise<number> {
    const current = this.states.get(resourceId)
    if (current?.active) return current.blockedUntil

    const persisted = await this.persistedState(resourceId)
    const latest = this.states.get(resourceId)
    // A request may have started or completed while storage was being read.
    // Any newer in-memory state wins over that potentially stale value.
    if (latest && latest !== current) return latest.blockedUntil

    const blockedUntil = Math.max(latest?.blockedUntil ?? 0, persisted.blockedUntil)
    const uncertainFailures = Math.max(latest?.uncertainFailures ?? 0, persisted.uncertainFailures)
    this.states.set(resourceId, { active: false, blockedUntil, uncertainFailures })
    return blockedUntil
  }

  async acquire(resourceId: string): Promise<ResourceLogRequestAcquisition> {
    const now = this.now()
    const current = this.states.get(resourceId)
    if (current?.active || (current?.blockedUntil ?? 0) > now) {
      return { acquired: false, blockedUntil: current?.blockedUntil ?? now }
    }

    // Reserve synchronously before touching storage so two callers in the same
    // JS runtime can never both pass the gate.
    const provisionalUncertainFailures = (current?.uncertainFailures ?? 0) + 1
    const provisionalBlockedUntil = now + uncertainCooldown(provisionalUncertainFailures)
    this.states.set(resourceId, {
      active: true,
      blockedUntil: provisionalBlockedUntil,
      uncertainFailures: provisionalUncertainFailures,
    })

    const persisted = await this.persistedState(resourceId)
    if (persisted.blockedUntil > now) {
      this.states.set(resourceId, { active: false, ...persisted })
      return { acquired: false, blockedUntil: persisted.blockedUntil }
    }

    const uncertainFailures = Math.max(current?.uncertainFailures ?? 0, persisted.uncertainFailures) + 1
    const blockedUntil = now + uncertainCooldown(uncertainFailures)
    this.states.set(resourceId, { active: true, blockedUntil, uncertainFailures })
    await this.persistState(resourceId, { blockedUntil, uncertainFailures })
    let completed = false

    return {
      acquired: true,
      lease: {
        blockedUntil,
        complete: async (outcome) => {
          const existing = this.states.get(resourceId)
          if (completed) return existing?.blockedUntil ?? blockedUntil
          completed = true

          const nextUncertainFailures = outcome === "uncertain" ? uncertainFailures : 0
          const nextBlockedUntil = this.now() + outcomeCooldown(outcome, nextUncertainFailures)
          this.states.set(resourceId, {
            active: false,
            blockedUntil: nextBlockedUntil,
            uncertainFailures: nextUncertainFailures,
          })
          await this.persistState(resourceId, {
            blockedUntil: nextBlockedUntil,
            uncertainFailures: nextUncertainFailures,
          })
          return nextBlockedUntil
        },
      },
    }
  }
}

export const resourceLogRequestGate = new ResourceLogRequestGate(AsyncStorage)
