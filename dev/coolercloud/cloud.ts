import { importPKCS8, SignJWT } from "jose"

// claim envelope coolerbridge verifies, must match its expectations exactly
const ISSUER = "https://cloud.getcooler.app"
const AUDIENCE = "coolerbridge"
const ASSERTION_TTL = "5m"

// explicit typ per token kind, mirrored by coolerbridge so one kind never passes as another
const TOKEN_TYPES = {
  pair: "cooler-pair+jwt",
  access: "cooler-access+jwt",
} as const

const PRIVATE_KEY_PATH = "./dev/coolercloud/keys/cooler-private.pem"

/** development account the emulated cloud signs for */
export const CLOUD_USER = {
  id: "usr_dev_danfq",
  email: "dan@getcooler.app",
  name: "Dan",
}

/**
 * load the emulated cloud private signing key
 *
 * @returns ed25519 private key
 */
export const loadPrivateKey = async () => {
  const file = Bun.file(PRIVATE_KEY_PATH)
  if (!(await file.exists())) {
    throw new Error("missing signing key, run `bun run cloud:keys` first")
  }
  return importPKCS8(await file.text(), "Ed25519")
}

/** resolved private key type used by the signing helpers */
type CloudKey = Awaited<ReturnType<typeof loadPrivateKey>>

/**
 * sign an access assertion for a bridge
 *
 * @param privateKey ed25519 private key
 * @param bridgeId real bridge uuid, required so the session fk resolves
 * @param scope bridge scopes to grant
 *
 * @returns signed jwt
 */
export const signAccessAssertion = (privateKey: CloudKey, bridgeId: string, scope: string[]) =>
  new SignJWT({ bridgeId, scope })
    .setProtectedHeader({ alg: "Ed25519", typ: TOKEN_TYPES.access })
    .setJti(crypto.randomUUID())
    .setSubject(CLOUD_USER.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ASSERTION_TTL)
    .sign(privateKey)

/**
 * sign a pairing assertion for a bridge challenge
 *
 * @param privateKey ed25519 private key
 * @param bridgeId real bridge uuid
 * @param pairingId bridge pairing challenge id
 *
 * @returns signed jwt and its jti, which the bridge reports back on confirmation
 */
export const signPairAssertion = async (privateKey: CloudKey, bridgeId: string, pairingId: string) => {
  const jti = crypto.randomUUID()
  const assertion = await new SignJWT({ bridgeId, pairingId })
    .setProtectedHeader({ alg: "Ed25519", typ: TOKEN_TYPES.pair })
    .setJti(jti)
    .setSubject(CLOUD_USER.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ASSERTION_TTL)
    .sign(privateKey)

  return { assertion, jti }
}

/**
 * sign an assertion with a tampered body to emulate a rejected request
 *
 * replaces the signature with noise so verification fails
 *
 * @param privateKey ed25519 private key
 * @param bridgeId real bridge uuid
 * @param scope bridge scopes
 *
 * @returns an invalid jwt
 */
export const signTamperedAssertion = async (privateKey: CloudKey, bridgeId: string, scope: string[]) => {
  const valid = await signAccessAssertion(privateKey, bridgeId, scope)
  const [header, body] = valid.split(".")
  return `${header}.${body}.tampered-signature`
}

/**
 * sign an already expired access assertion to emulate a stale credential
 *
 * @param privateKey ed25519 private key
 * @param bridgeId real bridge uuid
 * @param scope bridge scopes
 *
 * @returns an expired jwt
 */
export const signExpiredAssertion = (privateKey: CloudKey, bridgeId: string, scope: string[]) =>
  new SignJWT({ bridgeId, scope })
    .setProtectedHeader({ alg: "Ed25519", typ: TOKEN_TYPES.access })
    .setJti(crypto.randomUUID())
    .setSubject(CLOUD_USER.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
    .sign(privateKey)
