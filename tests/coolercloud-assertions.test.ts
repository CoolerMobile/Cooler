import { beforeAll, describe, expect, test } from "bun:test"
import { exportSPKI, generateKeyPair, importSPKI, jwtVerify } from "jose"
import {
  signAccessAssertion,
  signExpiredAssertion,
  signPairAssertion,
  signTamperedAssertion,
} from "../dev/coolercloud/cloud"

// mirror the exact verification coolerbridge performs on cloud assertions
const ISSUER = "https://cloud.getcooler.app"
const AUDIENCE = "coolerbridge"
const VERIFY_OPTIONS = {
  algorithms: ["Ed25519"],
  issuer: ISSUER,
  audience: AUDIENCE,
  maxTokenAge: "5m",
  clockTolerance: "30s",
}
const ACCESS_OPTIONS = { ...VERIFY_OPTIONS, typ: "cooler-access+jwt" }
const PAIR_OPTIONS = { ...VERIFY_OPTIONS, typ: "cooler-pair+jwt" }
const BRIDGE_ID = "11111111-1111-1111-1111-111111111111"

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"]
let publicKey: Awaited<ReturnType<typeof importSPKI>>

beforeAll(async () => {
  const pair = await generateKeyPair("Ed25519", { extractable: true })
  privateKey = pair.privateKey
  // round trip through spki pem the way the gen script and bridge do
  publicKey = await importSPKI(await exportSPKI(pair.publicKey), "Ed25519")
})

describe("access assertions", () => {
  test("verify with the cloud public key and carry the expected claims", async () => {
    const assertion = await signAccessAssertion(privateKey, BRIDGE_ID, ["events:read", "devices:write"])
    const { payload, protectedHeader } = await jwtVerify(assertion, publicKey, ACCESS_OPTIONS)

    expect(protectedHeader.alg).toBe("Ed25519")
    expect(typeof payload.jti).toBe("string")
    expect(payload.sub).toBe("usr_dev_danfq")
    expect(payload.bridgeId).toBe(BRIDGE_ID)
    expect(payload.scope).toEqual(["events:read", "devices:write"])
    expect(payload.iss).toBe(ISSUER)
    expect(payload.aud).toBe(AUDIENCE)
  })
})

describe("pairing assertions", () => {
  test("carry the pairing id and bridge id", async () => {
    const { assertion } = await signPairAssertion(privateKey, BRIDGE_ID, "pairing-123")
    const { payload } = await jwtVerify(assertion, publicKey, PAIR_OPTIONS)

    expect(payload.sub).toBe("usr_dev_danfq")
    expect(payload.bridgeId).toBe(BRIDGE_ID)
    expect(payload.pairingId).toBe("pairing-123")
  })

  test("return the jti the bridge reports back on confirmation", async () => {
    const { assertion, jti } = await signPairAssertion(privateKey, BRIDGE_ID, "pairing-123")
    const { payload } = await jwtVerify(assertion, publicKey, PAIR_OPTIONS)

    expect(payload.jti).toBe(jti)
  })

  test("are never accepted as access assertions", async () => {
    const { assertion } = await signPairAssertion(privateKey, BRIDGE_ID, "pairing-123")
    await expect(jwtVerify(assertion, publicKey, ACCESS_OPTIONS)).rejects.toThrow('unexpected "typ"')
  })
})

describe("rejected assertions", () => {
  test("a tampered signature fails verification", async () => {
    const assertion = await signTamperedAssertion(privateKey, BRIDGE_ID, ["events:read"])
    await expect(jwtVerify(assertion, publicKey, ACCESS_OPTIONS)).rejects.toThrow()
  })

  test("an expired assertion fails verification", async () => {
    const assertion = await signExpiredAssertion(privateKey, BRIDGE_ID, ["events:read"])
    await expect(jwtVerify(assertion, publicKey, ACCESS_OPTIONS)).rejects.toThrow()
  })

  test("a different key fails verification", async () => {
    const assertion = await signAccessAssertion(privateKey, BRIDGE_ID, ["events:read"])
    const other = await generateKeyPair("Ed25519", { extractable: true })
    await expect(jwtVerify(assertion, other.publicKey, ACCESS_OPTIONS)).rejects.toThrow()
  })
})
