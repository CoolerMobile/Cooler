import { afterEach, describe, expect, mock, test } from "bun:test"

// the clients pull in config (expo-constants) and utils (react-native), neither
// of which load under bun, so stub both before importing
mock.module("react-native", () => ({
  Platform: { OS: "ios", select: (options: Record<string, unknown>) => options.ios ?? options.default },
}))
mock.module("expo-constants", () => ({ default: { expoConfig: { extra: {} }, easConfig: null } }))

// the default cloud url is under test, so a local .env override must not leak in
delete process.env.EXPO_PUBLIC_COOLER_CLOUD_URL

const bridge = await import("@/lib/cooler-cloud/bridge")
const cloud = await import("@/lib/cooler-cloud/cloud")

type Captured = { url: string; method: string; headers: Headers; body: unknown }

let captured: Captured | null = null
const originalFetch = globalThis.fetch

const stubFetch = (response: Response) => {
  globalThis.fetch = (async (
    input: unknown,
    init: { method?: string; headers?: HeadersInit; body?: string } = {}
  ) => {
    captured = {
      url: String(input),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: init.body ? JSON.parse(init.body) : undefined,
    }
    return response
  }) as typeof fetch
}

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

afterEach(() => {
  globalThis.fetch = originalFetch
  captured = null
})

describe("bridge client", () => {
  test("registerDevice posts the device data with a bearer token", async () => {
    stubFetch(jsonResponse({ id: "device-1" }, 201))

    const device = await bridge.registerDevice("https://bridge.test", "tok", {
      platform: "ios",
      pushToken: "ExponentPushToken[abc]",
    })

    expect(device.id).toBe("device-1")
    expect(captured?.url).toBe("https://bridge.test/v1/devices")
    expect(captured?.method).toBe("POST")
    expect(captured?.headers.get("authorization")).toBe("Bearer tok")
    expect(captured?.body).toEqual({ deviceData: { platform: "ios", pushToken: "ExponentPushToken[abc]" } })
  })

  test("exchangeAssertion posts the assertion", async () => {
    stubFetch(jsonResponse({ accessToken: "cbt_x", tokenType: "Bearer", expiresAt: "soon", scopes: [] }))

    const session = await bridge.exchangeAssertion("https://bridge.test", "assertion-jwt")

    expect(session.accessToken).toBe("cbt_x")
    expect(captured?.url).toBe("https://bridge.test/v1/auth/exchange")
    expect(captured?.body).toEqual({ assertion: "assertion-jwt" })
  })

  test("listEvents reads with a bearer token", async () => {
    stubFetch(jsonResponse([{ id: "event-1" }]))

    const events = await bridge.listEvents("https://bridge.test", "tok")

    expect(events).toHaveLength(1)
    expect(captured?.url).toBe("https://bridge.test/v1/events")
    expect(captured?.method).toBe("GET")
    expect(captured?.headers.get("authorization")).toBe("Bearer tok")
  })

  test("surfaces the bridge error body", async () => {
    stubFetch(jsonResponse({ error: "Device not found" }, 404))

    await expect(bridge.deleteDevice("https://bridge.test", "tok", "missing")).rejects.toThrow(
      "Device not found"
    )
  })
})

describe("cloud client", () => {
  test("exchangeCode posts the code and redirect to the default cloud", async () => {
    stubFetch(jsonResponse({ token: "ccs_x", expiresAt: "soon", user: { id: "u", email: "e" } }))

    const result = await cloud.exchangeCode("CLD-1234-5678")

    expect(result.token).toBe("ccs_x")
    expect(captured?.url).toBe("https://cloud.getcooler.app/v1/auth/token")
    expect(captured?.body).toEqual({ code: "CLD-1234-5678", redirectUri: "cooler://auth" })
  })

  test("requestAccessAssertion scopes the request to the bridge", async () => {
    stubFetch(jsonResponse({ assertion: "signed" }))

    const result = await cloud.requestAccessAssertion("ccs_x", "bridge-uuid", ["events:read"])

    expect(result.assertion).toBe("signed")
    expect(captured?.url).toBe("https://cloud.getcooler.app/v1/bridges/bridge-uuid/assertions/access")
    expect(captured?.headers.get("authorization")).toBe("Bearer ccs_x")
    expect(captured?.body).toEqual({ scope: ["events:read"] })
  })

  test("confirmPairing asks the cloud to confirm the bridge's pairing", async () => {
    stubFetch(jsonResponse({ paired: true }))

    const result = await cloud.confirmPairing("ccs_x", "bridge-uuid", "pairing-uuid")

    expect(result.paired).toBe(true)
    expect(captured?.url).toBe("https://cloud.getcooler.app/v1/bridges/bridge-uuid/assertions/pair/confirm")
    expect(captured?.method).toBe("POST")
    expect(captured?.headers.get("authorization")).toBe("Bearer ccs_x")
    expect(captured?.body).toEqual({ pairingId: "pairing-uuid" })
  })

  test("authorizeUrl carries the redirect and state", () => {
    const url = cloud.authorizeUrl("state-123")

    expect(url.startsWith("https://cloud.getcooler.app/authorize?")).toBe(true)
    expect(url).toContain("redirect_uri=cooler%3A%2F%2Fauth")
    expect(url).toContain("state=state-123")
    expect(url).toContain("response_type=code")
  })
})
