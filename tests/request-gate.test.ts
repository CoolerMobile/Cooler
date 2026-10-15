import { describe, expect, test } from "bun:test"
import {
  RESOURCE_LOG_FIRST_UNCERTAIN_COOLDOWN_MS,
  RESOURCE_LOG_HTTP_ERROR_COOLDOWN_MS,
  RESOURCE_LOG_REPEATED_UNCERTAIN_COOLDOWN_MS,
  RESOURCE_LOG_SECOND_UNCERTAIN_COOLDOWN_MS,
  RESOURCE_LOG_SUCCESS_COOLDOWN_MS,
  ResourceLogRequestGate,
} from "@/lib/coolify/request-gate"

class MemoryStorage {
  readonly values = new Map<string, string>()

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value)
  }
}

class DeferredReadStorage extends MemoryStorage {
  private readonly pendingReads: Array<(value: string | null) => void> = []

  override async getItem(): Promise<string | null> {
    return new Promise((resolve) => this.pendingReads.push(resolve))
  }

  resolveReads(value: string | null): void {
    for (const resolve of this.pendingReads.splice(0)) resolve(value)
  }

  resolveRead(index: number, value: string | null): void {
    const [resolve] = this.pendingReads.splice(index, 1)
    if (!resolve) throw Error(`No pending read at index ${index}`)
    resolve(value)
  }
}

describe("ResourceLogRequestGate", () => {
  test("allows only one concurrent request across callers", async () => {
    const storage = new MemoryStorage()
    const gate = new ResourceLogRequestGate(storage, () => 1_000)

    const [first, second] = await Promise.all([gate.acquire("resource"), gate.acquire("resource")])

    expect([first.acquired, second.acquired].filter(Boolean)).toHaveLength(1)
    expect([first.acquired, second.acquired].filter((value) => !value)).toHaveLength(1)
  })

  test("a late cooldown lookup cannot overwrite an active request lock", async () => {
    const storage = new DeferredReadStorage()
    const gate = new ResourceLogRequestGate(storage, () => 1_000)

    const lookup = gate.getBlockedUntil("resource")
    await Promise.resolve()
    const acquisition = gate.acquire("resource")
    await Promise.resolve()
    storage.resolveReads(null)

    expect((await acquisition).acquired).toBe(true)
    expect(await lookup).toBe(1_000 + RESOURCE_LOG_FIRST_UNCERTAIN_COOLDOWN_MS)
    expect((await gate.acquire("resource")).acquired).toBe(false)
  })

  test("a stale cooldown lookup cannot extend a request that already succeeded", async () => {
    let now = 2_000
    const storage = new DeferredReadStorage()
    const gate = new ResourceLogRequestGate(storage, () => now)

    const lookup = gate.getBlockedUntil("resource")
    await Promise.resolve()
    const acquisitionPromise = gate.acquire("resource")
    await Promise.resolve()

    // Resolve the acquisition's storage read while leaving the older lookup pending.
    storage.resolveRead(1, null)
    const acquisition = await acquisitionPromise
    if (!acquisition.acquired) throw Error("Expected the request to acquire the gate")

    now += 1_000
    const successBlockedUntil = await acquisition.lease.complete("success")
    storage.resolveRead(0, String(2_000 + RESOURCE_LOG_REPEATED_UNCERTAIN_COOLDOWN_MS))

    expect(await lookup).toBe(successBlockedUntil)
  })

  test("persists the first guard before starting the network request", async () => {
    let now = 10_000
    const storage = new MemoryStorage()
    const firstProcess = new ResourceLogRequestGate(storage, () => now)
    const acquisition = await firstProcess.acquire("resource")

    expect(acquisition.acquired).toBe(true)

    const restartedProcess = new ResourceLogRequestGate(storage, () => now)
    const blocked = await restartedProcess.acquire("resource")

    expect(blocked).toEqual({
      acquired: false,
      blockedUntil: now + RESOURCE_LOG_FIRST_UNCERTAIN_COOLDOWN_MS,
    })
  })

  test("persists uncertain escalation across app restarts", async () => {
    let now = 15_000
    const storage = new MemoryStorage()
    const firstProcess = new ResourceLogRequestGate(storage, () => now)
    const first = await firstProcess.acquire("resource")
    if (!first.acquired) throw Error("Expected the first request to acquire the gate")

    now = await first.lease.complete("uncertain")
    const restartedProcess = new ResourceLogRequestGate(storage, () => now)
    const second = await restartedProcess.acquire("resource")
    if (!second.acquired) throw Error("Expected the second request to acquire the gate")

    expect(second.lease.blockedUntil).toBe(now + RESOURCE_LOG_SECOND_UNCERTAIN_COOLDOWN_MS)
  })

  test("uses a short bounded cooldown after a successful response", async () => {
    let now = 20_000
    const gate = new ResourceLogRequestGate(new MemoryStorage(), () => now)
    const acquisition = await gate.acquire("resource")
    if (!acquisition.acquired) throw Error("Expected the first request to acquire the gate")

    now += 5_000
    const blockedUntil = await acquisition.lease.complete("success")
    expect(blockedUntil).toBe(now + RESOURCE_LOG_SUCCESS_COOLDOWN_MS)

    now = blockedUntil - 1
    expect((await gate.acquire("resource")).acquired).toBe(false)

    now = blockedUntil
    expect((await gate.acquire("resource")).acquired).toBe(true)
  })

  test("escalates consecutive uncertain results from two minutes to ten minutes to one hour", async () => {
    let now = 30_000
    const gate = new ResourceLogRequestGate(new MemoryStorage(), () => now)
    const first = await gate.acquire("resource")
    if (!first.acquired) throw Error("Expected the first request to acquire the gate")

    now += 60_000
    const firstBlockedUntil = await first.lease.complete("uncertain")
    expect(firstBlockedUntil).toBe(now + RESOURCE_LOG_FIRST_UNCERTAIN_COOLDOWN_MS)

    now = firstBlockedUntil
    const second = await gate.acquire("resource")
    if (!second.acquired) throw Error("Expected the second request to acquire the gate")
    expect(second.lease.blockedUntil).toBe(now + RESOURCE_LOG_SECOND_UNCERTAIN_COOLDOWN_MS)
    const secondBlockedUntil = await second.lease.complete("uncertain")
    expect(secondBlockedUntil).toBe(now + RESOURCE_LOG_SECOND_UNCERTAIN_COOLDOWN_MS)

    now = secondBlockedUntil
    const third = await gate.acquire("resource")
    if (!third.acquired) throw Error("Expected the third request to acquire the gate")
    expect(third.lease.blockedUntil).toBe(now + RESOURCE_LOG_REPEATED_UNCERTAIN_COOLDOWN_MS)
    const thirdBlockedUntil = await third.lease.complete("uncertain")
    expect(thirdBlockedUntil).toBe(now + RESOURCE_LOG_REPEATED_UNCERTAIN_COOLDOWN_MS)

    now = thirdBlockedUntil
    const fourth = await gate.acquire("resource")
    if (!fourth.acquired) throw Error("Expected the fourth request to acquire the gate")
    expect(fourth.lease.blockedUntil).toBe(now + RESOURCE_LOG_REPEATED_UNCERTAIN_COOLDOWN_MS)
  })

  test("a successful response resets uncertain backoff", async () => {
    let now = 35_000
    const gate = new ResourceLogRequestGate(new MemoryStorage(), () => now)
    const first = await gate.acquire("resource")
    if (!first.acquired) throw Error("Expected the first request to acquire the gate")

    now = await first.lease.complete("uncertain")
    const second = await gate.acquire("resource")
    if (!second.acquired) throw Error("Expected the second request to acquire the gate")
    expect(second.lease.blockedUntil).toBe(now + RESOURCE_LOG_SECOND_UNCERTAIN_COOLDOWN_MS)

    now = await second.lease.complete("success")
    const reset = await gate.acquire("resource")
    if (!reset.acquired) throw Error("Expected the reset request to acquire the gate")
    expect(reset.lease.blockedUntil).toBe(now + RESOURCE_LOG_FIRST_UNCERTAIN_COOLDOWN_MS)
  })

  test("distinguishes immediate HTTP failures from uncertain disconnects", async () => {
    let now = 40_000
    const gate = new ResourceLogRequestGate(new MemoryStorage(), () => now)
    const acquisition = await gate.acquire("resource")
    if (!acquisition.acquired) throw Error("Expected the first request to acquire the gate")

    now += 1_000
    expect(await acquisition.lease.complete("http-error")).toBe(now + RESOURCE_LOG_HTTP_ERROR_COOLDOWN_MS)
  })
})
