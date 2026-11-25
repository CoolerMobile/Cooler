import { isDemoConnectionId, isDemoEndpoint, isDemoToken } from "@/lib/demo/fixtures"
import {
  demoCloudRequest,
  demoConnectionCheck,
  demoCoolifyRequest,
  isDemoServer,
  resetDemoEngine,
  setDemoModeActive,
  shouldUseDemoBridge,
  shouldUseDemoCloud,
} from "@/lib/demo/runtime"
import { afterEach, describe, expect, test } from "bun:test"

afterEach(() => {
  setDemoModeActive(false)
  resetDemoEngine()
})

describe("demo predicates", () => {
  test("recognise demo hosts only", () => {
    expect(isDemoEndpoint("https://coolify.demo.invalid")).toBe(true)
    expect(isDemoEndpoint("https://coolify.example.com")).toBe(false)
    expect(isDemoEndpoint("https://demo.invalid.example.com")).toBe(false)
    expect(isDemoEndpoint("not a url")).toBe(false)
  })

  test("recognise demo tokens and connections", () => {
    expect(isDemoToken("demo_ccs_1")).toBe(true)
    expect(isDemoToken("ccs_1")).toBe(false)
    expect(isDemoToken(undefined)).toBe(false)
    expect(isDemoConnectionId("demo-production")).toBe(true)
    expect(isDemoConnectionId("4f1c2a")).toBe(false)
  })

  test("route demo servers regardless of the demo flag", () => {
    expect(isDemoServer({ id: "demo-production", endpoint: "https://coolify.demo.invalid" })).toBe(true)
    expect(isDemoServer({ id: "4f1c2a", endpoint: "https://coolify.example.com" })).toBe(false)
  })

  test("route cloud and bridge requests by token, host or flag", () => {
    expect(shouldUseDemoCloud("ccs_real")).toBe(false)
    expect(shouldUseDemoCloud("demo_ccs")).toBe(true)
    expect(shouldUseDemoBridge("https://bridge.example.com", "cbt_real")).toBe(false)
    expect(shouldUseDemoBridge("https://bridge.demo.invalid")).toBe(true)

    setDemoModeActive(true)
    expect(shouldUseDemoCloud()).toBe(true)
    expect(shouldUseDemoBridge("https://bridge.example.com")).toBe(true)
  })
})

describe("demo requests", () => {
  test("answer coolify requests without the network", async () => {
    const originalFetch = globalThis.fetch
    let fetched = false
    globalThis.fetch = (async () => {
      fetched = true
      throw Error("network used")
    }) as unknown as typeof fetch

    try {
      const servers = await demoCoolifyRequest<unknown[]>({ id: "demo-homelab" }, "servers")
      const session = await demoCloudRequest<{ token: string }>("auth/token", {
        method: "POST",
        body: { code: "demo" },
      })

      expect(servers).toHaveLength(1)
      expect(isDemoToken(session.token)).toBe(true)
      expect(fetched).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("honour an aborted signal", async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      demoCoolifyRequest({ id: "demo-homelab" }, "servers", { signal: controller.signal })
    ).rejects.toThrow("aborted")
  })

  test("only demo hosts can be validated in demo mode", async () => {
    await expect(demoConnectionCheck("https://coolify.example.com")).rejects.toThrow("Exit it in Settings")
    expect(await demoConnectionCheck("https://coolify.demo.invalid")).toEqual({
      health: "OK",
      version: expect.stringMatching(/^4\.0\.0/),
    })
  })
})
