import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * uploads an ios build to app store connect for testflight
 *
 * the one submission step for every release, whether the ipa was built locally
 * or on eas; it talks to app store connect directly through asc, so it never
 * waits in a build service queue
 *
 * auth is asc's own: the signed-in keychain profile locally, or ASC_KEY_ID,
 * ASC_ISSUER_ID and ASC_PRIVATE_KEY_B64 in ci
 *
 * usage: bun scripts/submit-ios.ts <path/to/app.ipa> [extra asc flags, e.g. --dry-run]
 */

const root = join(import.meta.dir, "..")

/**
 * stops with a message
 *
 * @param message what went wrong and how to fix it
 */
const fail = (message: string): never => {
  console.error(message)
  process.exit(1)
}

const [ipa, ...extra] = Bun.argv.slice(2)
if (!ipa || !existsSync(ipa)) fail("Usage: bun scripts/submit-ios.ts <path/to/app.ipa> [asc flags]")
if (!Bun.which("asc")) fail("asc is not installed. Install it with `brew install asc`.")

// the same app the eas submit profile targets
const eas = JSON.parse(readFileSync(join(root, "eas.json"), "utf8"))
const appId: string | undefined = eas.submit?.production?.ios?.ascAppId
if (!appId) fail("No App Store Connect app id at submit.production.ios.ascAppId in eas.json.")

// watch briefly after the upload, so an immediate processing rejection fails the release
const upload = Bun.spawnSync(
  ["asc", "builds", "upload", "--app", appId!, "--ipa", ipa!, "--verify-timeout", "2m", "--output", "table", ...extra],
  { cwd: root, stdout: "inherit", stderr: "inherit" }
)
if (!upload.success) fail(`Uploading ${ipa} to App Store Connect failed.`)

console.log("Uploaded to App Store Connect. It appears in TestFlight once Apple finishes processing it.")
