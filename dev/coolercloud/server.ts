import QRCode from "qrcode"
import * as bridgeAdmin from "./bridge"
import { CLOUD_USER, loadPrivateKey, signAccessAssertion, signPairAssertion } from "./cloud"

// emulated coolercloud http server the app talks to during development
const PORT = Number(process.env.PORT ?? 4000)
const BRIDGE_URL = process.env.COOLER_BRIDGE_URL ?? "http://localhost:3000"
const BRIDGE_NAME = process.env.COOLER_BRIDGE_NAME ?? "Emulated Coolify"

type LinkedBridge = {
  cloudBridgeId: string
  name: string
  baseUrl: string
  webhookUrl: string
}

const privateKey = await loadPrivateKey()

// in-memory emulation state, reset on every restart
const authCodes = new Map<string, { used: boolean }>()
const sessions = new Set<string>()
let bridges: LinkedBridge[] = []

// signed pairing assertions by jti, awaiting the bridge's confirmation
const pairings = new Map<string, { bridgeId: string; pairingId: string }>()

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null

const randomBlock = () => Math.random().toString(36).slice(2, 6).toUpperCase()

/**
 * provision and pair a bridge so the exchange flow works end to end
 *
 * links the development account to a fresh bridge and remembers its webhook
 */
const provisionBridge = async () => {
  try {
    const created = await bridgeAdmin.createBridge(BRIDGE_URL, BRIDGE_NAME)
    if (!created.ok) throw new Error(`bridge create failed (${created.status})`)
    const bridgeId = created.data.id

    const pairing = await bridgeAdmin.createPairing(BRIDGE_URL)
    if (!pairing.ok) throw new Error(`pairing create failed (${pairing.status})`)

    const { assertion } = await signPairAssertion(privateKey, bridgeId, pairing.data.id)
    const completed = await bridgeAdmin.completePairing(BRIDGE_URL, {
      code: pairing.data.code,
      assertion,
    })
    if (!completed.ok) throw new Error(`pairing complete failed (${completed.status})`)

    bridges = [
      {
        cloudBridgeId: bridgeId,
        name: BRIDGE_NAME,
        baseUrl: BRIDGE_URL,
        webhookUrl: created.data.webhookUrl,
      },
    ]
    console.info(`linked bridge ${bridgeId} at ${BRIDGE_URL}`)
    console.info(`coolify webhook: ${BRIDGE_URL}${created.data.webhookUrl}`)
  } catch (error) {
    console.warn(`could not provision a bridge: ${(error as Error).message}`)
    console.warn("sign in still works but there is no linked bridge to exchange with")
  }
}

/** render the approval page with a tappable deep link and a scannable qr */
const authorizePage = async (redirectUri: string, state: string) => {
  const code = `CLD-${randomBlock()}-${randomBlock()}`
  authCodes.set(code, { used: false })

  const params = new URLSearchParams({ code, state })
  const returnUrl = `${redirectUri}?${params.toString()}`
  const qr = await QRCode.toString(returnUrl, { type: "svg", margin: 1, width: 220 })

  return `<!doctype html>
<html>
  <head><meta name="viewport" content="width=device-width, initial-scale=1" /><title>CoolerCloud</title></head>
  <body style="font-family: system-ui; max-width: 420px; margin: 40px auto; padding: 0 16px; text-align: center;">
    <h1>CoolerCloud</h1>
    <p>Approve sign in for <strong>${CLOUD_USER.email}</strong>.</p>
    <p><a href="${returnUrl}" style="display:inline-block; padding:12px 20px; background:#208AEF; color:#fff; border-radius:8px; text-decoration:none;">Approve</a></p>
    <p>Or enter this code in the app:</p>
    <p><code style="font-size:20px;">${code}</code></p>
    <div>${qr}</div>
  </body>
</html>`
}

await provisionBridge()

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const { pathname } = url

    // health
    if (req.method === "GET" && pathname === "/health") {
      return json({ status: "ok", service: "coolercloud-emulator" })
    }

    // browser authorize page
    if (req.method === "GET" && pathname === "/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri") ?? "cooler://auth"
      const state = url.searchParams.get("state") ?? ""
      return new Response(await authorizePage(redirectUri, state), {
        headers: { "Content-Type": "text/html" },
      })
    }

    // exchange an oauth code for a cloud session
    if (req.method === "POST" && pathname === "/v1/auth/token") {
      const body = (await req.json().catch(() => null)) as { code?: string } | null
      const entry = body?.code ? authCodes.get(body.code) : undefined
      if (!entry || entry.used) return json({ error: "invalid or expired code" }, 400)

      entry.used = true
      const token = `ccs_${crypto.randomUUID()}`
      sessions.add(token)
      return json({
        token,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        user: CLOUD_USER,
      })
    }

    // account overview
    if (req.method === "GET" && pathname === "/v1/me") {
      const token = bearer(req)
      if (!token || !sessions.has(token)) return json({ error: "Unauthorized" }, 401)
      return json({
        user: CLOUD_USER,
        bridges: bridges.map(({ cloudBridgeId, name, baseUrl }) => ({ cloudBridgeId, name, baseUrl })),
      })
    }

    // assertion issuance
    const accessMatch = pathname.match(/^\/v1\/bridges\/(.+)\/assertions\/access$/)
    if (req.method === "POST" && accessMatch) {
      const token = bearer(req)
      if (!token || !sessions.has(token)) return json({ error: "Unauthorized" }, 401)

      const body = (await req.json().catch(() => null)) as { scope?: string[] } | null
      const assertion = await signAccessAssertion(privateKey, accessMatch[1], body?.scope ?? [])
      return json({ assertion })
    }

    const pairMatch = pathname.match(/^\/v1\/bridges\/(.+)\/assertions\/pair$/)
    if (req.method === "POST" && pairMatch) {
      const token = bearer(req)
      if (!token || !sessions.has(token)) return json({ error: "Unauthorized" }, 401)

      const body = (await req.json().catch(() => null)) as { pairingId?: string } | null
      if (!body?.pairingId) return json({ error: "pairingId is required" }, 400)

      const { assertion, jti } = await signPairAssertion(privateKey, pairMatch[1], body.pairingId)
      pairings.set(jti, { bridgeId: pairMatch[1], pairingId: body.pairingId })
      return json({ assertion })
    }

    // pairing confirmation, checked with the bridge itself like the real cloud
    const confirmMatch = pathname.match(/^\/v1\/bridges\/(.+)\/assertions\/pair\/confirm$/)
    if (req.method === "POST" && confirmMatch) {
      const token = bearer(req)
      if (!token || !sessions.has(token)) return json({ error: "Unauthorized" }, 401)

      const body = (await req.json().catch(() => null)) as { pairingId?: string } | null
      if (!body?.pairingId) return json({ error: "pairingId is required" }, 400)

      const reported = await bridgeAdmin.getPairing(BRIDGE_URL, body.pairingId)
      const signed = reported.ok && reported.data.jti ? pairings.get(reported.data.jti) : undefined
      if (
        reported.data?.status !== "completed" ||
        signed?.bridgeId !== confirmMatch[1] ||
        signed.pairingId !== body.pairingId
      ) {
        return json({ error: "This pairing couldn't be confirmed" }, 409)
      }

      return json({ paired: true })
    }

    // logout
    if (req.method === "POST" && pathname === "/v1/auth/logout") {
      const token = bearer(req)
      if (token) sessions.delete(token)
      return json({ loggedOut: true })
    }

    return json({ error: "Not found" }, 404)
  },
})

console.info(`coolercloud emulator listening on http://localhost:${PORT}`)
console.info(`point the app at it with EXPO_PUBLIC_COOLER_CLOUD_URL=http://localhost:${PORT}`)
