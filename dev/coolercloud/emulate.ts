import * as bridge from "./bridge"
import {
  loadPrivateKey,
  signAccessAssertion,
  signExpiredAssertion,
  signPairAssertion,
  signTamperedAssertion,
} from "./cloud"

// drive the full device flow against a running coolerbridge, no app needed
//
// usage: bun run cloud:emulate -- --flow success|fail --bridge http://localhost:3000

const args = process.argv.slice(2)
const flagValue = (name: string, fallback: string) => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const BRIDGE_URL = flagValue("--bridge", process.env.COOLER_BRIDGE_URL ?? "http://localhost:3000")
const FLOW = flagValue("--flow", "success")
const SCOPES = ["events:read", "devices:read", "devices:write"]
const PUSH_TOKEN = "ExponentPushToken[emulated-device]"

let failures = 0

const step = (label: string, ok: boolean, detail?: string) => {
  console.info(`${ok ? "ok  " : "fail"} ${label}${detail ? ` (${detail})` : ""}`)
  if (!ok) failures += 1
}

/** provision and pair a bridge, returning its ids */
const linkBridge = async (privateKey: Awaited<ReturnType<typeof loadPrivateKey>>) => {
  const created = await bridge.createBridge(BRIDGE_URL)
  step("provision bridge", created.ok, `status ${created.status}`)
  if (!created.ok) throw new Error("could not provision a bridge")

  const pairing = await bridge.createPairing(BRIDGE_URL)
  step("create pairing challenge", pairing.ok, `status ${pairing.status}`)

  const { assertion, jti } = await signPairAssertion(privateKey, created.data.id, pairing.data.id)
  const completed = await bridge.completePairing(BRIDGE_URL, { code: pairing.data.code, assertion })
  step("complete pairing", completed.ok && completed.data.linked === true, `status ${completed.status}`)

  // the cloud confirms the round trip by matching the jti the bridge reports
  const status = await bridge.getPairing(BRIDGE_URL, pairing.data.id)
  step(
    "bridge reports the consuming assertion",
    status.ok && status.data.status === "completed" && status.data.jti === jti,
    `status ${status.data?.status}`
  )

  return { bridgeId: created.data.id, webhookUrl: created.data.webhookUrl, pairing, assertion }
}

/** run the happy path from pairing through to a delivered event */
const runSuccess = async () => {
  const privateKey = await loadPrivateKey()
  const { bridgeId, webhookUrl } = await linkBridge(privateKey)

  const assertion = await signAccessAssertion(privateKey, bridgeId, SCOPES)
  const session = await bridge.exchange(BRIDGE_URL, assertion)
  step("exchange access assertion", session.ok, `scopes ${session.data?.scopes?.join(", ")}`)

  const device = await bridge.registerDevice(BRIDGE_URL, session.data.accessToken, {
    platform: "ios",
    pushToken: PUSH_TOKEN,
  })
  step("register device", device.ok, `status ${device.status}`)

  const webhook = await bridge.sendWebhook(BRIDGE_URL, webhookUrl, {
    success: true,
    event: "deployment.success",
    message: "Deployment finished successfully",
    application_name: "web",
    application_uuid: "app-123",
    deployment_uuid: "dep-123",
    project: "demo",
    environment: "production",
  })
  step("deliver coolify webhook", webhook.ok, `status ${webhook.status}`)

  const events = await bridge.listEvents(BRIDGE_URL, session.data.accessToken)
  step("list events", events.ok && events.data.length > 0, `${events.data.length} event(s)`)
}

/** run flows that must be rejected and assert the bridge refuses them */
const runFailures = async () => {
  const privateKey = await loadPrivateKey()
  const { bridgeId, pairing, assertion: pairAssertion } = await linkBridge(privateKey)

  // a pairing assertion can never pass as an access assertion
  const confused = await bridge.exchange(BRIDGE_URL, pairAssertion)
  step("pairing assertion rejected for access", confused.status === 401, `status ${confused.status}`)

  const tampered = await bridge.exchange(
    BRIDGE_URL,
    await signTamperedAssertion(privateKey, bridgeId, SCOPES)
  )
  step("tampered assertion rejected", tampered.status === 401, `status ${tampered.status}`)

  const expired = await bridge.exchange(BRIDGE_URL, await signExpiredAssertion(privateKey, bridgeId, SCOPES))
  step("expired assertion rejected", expired.status === 401, `status ${expired.status}`)

  const notAJwt = await bridge.exchange(BRIDGE_URL, "not-a-jwt")
  step("malformed assertion rejected", notAJwt.status === 401, `status ${notAJwt.status}`)

  // a session with no device scope cannot register a device
  const readOnly = await bridge.exchange(
    BRIDGE_URL,
    await signAccessAssertion(privateKey, bridgeId, ["events:read"])
  )
  const forbidden = await bridge.registerDevice(BRIDGE_URL, readOnly.data.accessToken, {
    platform: "ios",
    pushToken: PUSH_TOKEN,
  })
  step("missing scope rejected", forbidden.status === 403, `status ${forbidden.status}`)

  // a valid session still rejects a malformed expo token
  const full = await bridge.exchange(BRIDGE_URL, await signAccessAssertion(privateKey, bridgeId, SCOPES))
  const badToken = await bridge.registerDevice(BRIDGE_URL, full.data.accessToken, {
    platform: "ios",
    pushToken: "not-an-expo-token",
  })
  step("invalid push token rejected", badToken.status === 400, `status ${badToken.status}`)

  // reusing a consumed pairing code fails
  const reused = await bridge.completePairing(BRIDGE_URL, {
    code: pairing.data.code,
    assertion: (await signPairAssertion(privateKey, bridgeId, pairing.data.id)).assertion,
  })
  step("reused pairing code rejected", reused.status === 400, `status ${reused.status}`)
}

console.info(`emulating ${FLOW} flow against ${BRIDGE_URL}`)
console.info("")

try {
  if (FLOW === "fail") await runFailures()
  else await runSuccess()
} catch (error) {
  console.error(`flow aborted: ${(error as Error).message}`)
  process.exit(1)
}

console.info("")
if (failures > 0) {
  console.error(`${failures} step(s) did not behave as expected`)
  process.exit(1)
}
console.info("all steps behaved as expected")
