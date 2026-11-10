import {
  codeFromScan,
  extractAuthCode,
  isBridgeSessionExpired,
  isPairLink,
  parsePairLink,
} from "@/lib/cooler-cloud/session-utils"
import { describe, expect, test } from "bun:test"

describe("extractAuthCode", () => {
  test("returns the code from a redirect url", () => {
    expect(extractAuthCode("cooler://auth?code=ABC123&state=xyz")).toBe("ABC123")
  })

  test("verifies the state when one is expected", () => {
    expect(extractAuthCode("cooler://auth?code=ABC123&state=xyz", "xyz")).toBe("ABC123")
  })

  test("throws when the state does not match", () => {
    expect(() => extractAuthCode("cooler://auth?code=ABC123&state=xyz", "other")).toThrow(
      "sign in could not be verified"
    )
  })

  test("throws when no code is present", () => {
    expect(() => extractAuthCode("cooler://auth?state=xyz")).toThrow("sign in did not return a code")
  })

  test("decodes percent encoded values", () => {
    expect(extractAuthCode("cooler://auth?code=a%20b")).toBe("a b")
  })
})

describe("isBridgeSessionExpired", () => {
  const buffer = 60_000
  const now = 1_000_000

  test("is false well before expiry", () => {
    expect(isBridgeSessionExpired(new Date(now + 10 * 60_000).toISOString(), buffer, now)).toBe(false)
  })

  test("is true within the refresh buffer", () => {
    expect(isBridgeSessionExpired(new Date(now + 30_000).toISOString(), buffer, now)).toBe(true)
  })

  test("is true once past expiry", () => {
    expect(isBridgeSessionExpired(new Date(now - 1).toISOString(), buffer, now)).toBe(true)
  })
})

describe("codeFromScan", () => {
  test("trims a raw code", () => {
    expect(codeFromScan("  CLD-1234-5678  ")).toBe("CLD-1234-5678")
  })

  test("extracts a code from a scanned deep link", () => {
    expect(codeFromScan("cooler://auth?code=ABC123&state=xyz")).toBe("ABC123")
  })

  test("returns empty string for a deep link without a code", () => {
    expect(codeFromScan("cooler://auth?state=xyz")).toBe("")
  })
})

describe("isPairLink", () => {
  const link = `cooler://pair?bridge=cb_1&url=${encodeURIComponent("https://bridge.example.com")}`

  test("is true for a bridge pairing link", () => {
    expect(isPairLink(link)).toBe(true)
  })

  test("is false for a sign in redirect", () => {
    expect(isPairLink("cooler://auth?code=ABC123&state=xyz")).toBe(false)
  })

  test("is false for a raw code", () => {
    expect(isPairLink("CLD-1234-5678")).toBe(false)
  })
})

describe("parsePairLink", () => {
  test("extracts the bridge id, url and name", () => {
    const link =
      `cooler://pair?bridge=cb_1&url=${encodeURIComponent("https://bridge.example.com")}` +
      `&name=${encodeURIComponent("Prod Coolify")}`
    expect(parsePairLink(link)).toEqual({
      cloudBridgeId: "cb_1",
      baseUrl: "https://bridge.example.com",
      name: "Prod Coolify",
    })
  })

  test("leaves the name undefined when absent", () => {
    const link = `cooler://pair?bridge=cb_1&url=${encodeURIComponent("https://bridge.example.com")}`
    expect(parsePairLink(link)).toEqual({
      cloudBridgeId: "cb_1",
      baseUrl: "https://bridge.example.com",
      name: undefined,
    })
  })

  test("throws when the pairing params are missing", () => {
    expect(() => parsePairLink("cooler://auth?code=ABC123")).toThrow("valid bridge pairing link")
  })
})
