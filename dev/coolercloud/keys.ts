import { exportPKCS8, exportSPKI, generateKeyPair } from "jose"

/**
 * generate the coolercloud development ed25519 keypair
 *
 * the private key signs assertions here, the public key must be configured on
 * coolerbridge as CLOUD_PUBLIC_KEY so it can verify them
 */
const { privateKey, publicKey } = await generateKeyPair("Ed25519", { extractable: true })

const privatePem = await exportPKCS8(privateKey)
const publicPem = await exportSPKI(publicKey)

await Bun.write("./dev/coolercloud/keys/cooler-private.pem", privatePem)
await Bun.write("./dev/coolercloud/keys/cooler-public.pem", publicPem)

console.info("generated coolercloud development keys in dev/coolercloud/keys")
console.log()
console.info("configure this public key on coolerbridge as CLOUD_PUBLIC_KEY:")
console.log()
console.info(publicPem)
