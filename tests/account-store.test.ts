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
