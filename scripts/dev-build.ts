import { join } from "node:path"
import { ensureSynced } from "./preflight"

/**
 * builds the development client on eas
 *
 * both platforms by default, --android or --ios narrows the build, and like
 * every build it first makes sure the tree is committed and pushed
 */

const usage = [
  "Usage:",
  "  bun scripts/dev-build.ts [--android] [--ios]",
  "",
  "Builds the development client on EAS for both platforms unless --android or",
  "--ios narrows it. Checks first that the tree is clean and in step with origin.",
].join("\n")

const args = Bun.argv.slice(2)
const unknown = args.filter((arg) => arg !== "--android" && arg !== "--ios")

if (unknown.length > 0) {
  console.error(usage)
  process.exit(1)
}

const android = args.includes("--android")
const ios = args.includes("--ios")

// neither or both flags build every platform
const platform = android === ios ? "all" : android ? "android" : "ios"

ensureSynced()

const result = Bun.spawnSync(
  ["bunx", "eas-cli@latest", "build", "--profile", "development", "--platform", platform],
  { cwd: join(import.meta.dir, ".."), stdin: "inherit", stdout: "inherit", stderr: "inherit" }
)

process.exit(result.exitCode ?? 1)
