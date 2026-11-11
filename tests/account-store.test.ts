import { beforeEach, describe, expect, mock, test } from "bun:test"

// the store persists through secure storage, swap it for an in-memory stub
mock.module("@/lib/hooks/secure", () => {
  const memory = new Map<string, string>()
  return {
    migratingSecureStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
    },
  }
})

const { useAccountStore } = await import("@/lib/stores/account")

const session = {
  token: "ccs_x",
  expiresAt: "2026-01-01T00:00:00.000Z",
  user: { id: "u", email: "dan@getcooler.app" },
}

beforeEach(() => {
  useAccountStore.getState().reset()
})

describe("account store", () => {
  test("starts signed out", () => {
    const state = useAccountStore.getState()
    expect(state.session).toBeNull()
    expect(state.bridges).toEqual([])
    expect(state.bridgeSessions).toEqual({})
  })

  test("stores and clears a session", () => {
    useAccountStore.getState().setSession(session)
    expect(useAccountStore.getState().session?.user.email).toBe("dan@getcooler.app")

    useAccountStore.getState().setSession(null)
    expect(useAccountStore.getState().session).toBeNull()
  })

  test("tracks a bridge session and can clear it", () => {
    const bridgeSession = {
      cloudBridgeId: "bridge-1",
      accessToken: "cbt_1",
      expiresAt: "later",
      scopes: ["events:read"],
    }
    useAccountStore.getState().setBridgeSession(bridgeSession)
    expect(useAccountStore.getState().bridgeSessions["bridge-1"]).toEqual(bridgeSession)

    useAccountStore.getState().clearBridgeSession("bridge-1")
    expect(useAccountStore.getState().bridgeSessions["bridge-1"]).toBeUndefined()
  })

  test("records device ids per bridge", () => {
    useAccountStore.getState().setDeviceId("bridge-1", "device-1")
    expect(useAccountStore.getState().deviceIds["bridge-1"]).toBe("device-1")
  })

  test("removes one bridge with its session and device id, keeping the rest", () => {
    const store = useAccountStore.getState()
    store.setSession(session)
    store.setBridges([
      { cloudBridgeId: "bridge-1", name: "Prod", baseUrl: "https://bridge.test" },
      { cloudBridgeId: "bridge-2", name: "Staging", baseUrl: "https://staging.test" },
    ])
    store.setBridgeSession({ cloudBridgeId: "bridge-1", accessToken: "cbt_1", expiresAt: "x", scopes: [] })
    store.setBridgeSession({ cloudBridgeId: "bridge-2", accessToken: "cbt_2", expiresAt: "x", scopes: [] })
    store.setDeviceId("bridge-1", "device-1")
    store.setDeviceId("bridge-2", "device-2")

    store.removeBridge("bridge-1")

    const next = useAccountStore.getState()
    expect(next.session).toEqual(session)
    expect(next.bridges.map((link) => link.cloudBridgeId)).toEqual(["bridge-2"])
    expect(Object.keys(next.bridgeSessions)).toEqual(["bridge-2"])
    expect(next.deviceIds).toEqual({ "bridge-2": "device-2" })
  })

  test("reset clears account data", () => {
    const store = useAccountStore.getState()
    store.setSession(session)
    store.setBridges([{ cloudBridgeId: "bridge-1", name: "Prod", baseUrl: "https://bridge.test" }])
    store.setBridgeSession({ cloudBridgeId: "bridge-1", accessToken: "cbt_1", expiresAt: "x", scopes: [] })
    store.setDeviceId("bridge-1", "device-1")

    store.reset()

    const next = useAccountStore.getState()
    expect(next.session).toBeNull()
    expect(next.bridges).toEqual([])
    expect(next.bridgeSessions).toEqual({})
    expect(next.deviceIds).toEqual({})
  })
})
