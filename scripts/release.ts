import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

type Bump = "major" | "minor" | "patch"
type PackageJson = { version: string; [key: string]: unknown }

const root = join(import.meta.dir, "..")
const packagePath = join(root, "package.json")
const requestedBump = Bun.argv[2]
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

if (
  requestedBump &&
  !["major", "minor", "patch"].includes(requestedBump) &&
  !versionPattern.test(requestedBump)
) {
  throw new Error("Usage: bun release [patch|minor|major|x.y.z]")
}
const supportedTypes = new Set([
  "build",
  "chore",
  "ci",
  "docs",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
])

const fail = (message: string): never => {
  throw new Error(message)
}

const run = (command: string, args: string[], captureOutput = false) => {
  const result = Bun.spawnSync([command, ...args], {
    cwd: root,
    stdout: captureOutput ? "pipe" : "inherit",
    stderr: "inherit",
  })

  if (!result.success) {
    fail(`Command failed: ${command} ${args.join(" ")}`)
  }

  return captureOutput ? new TextDecoder().decode(result.stdout) : ""
}

const parseVersion = (version: string): [number, number, number] => {
  const match = versionPattern.exec(version)
  if (!match) throw new Error(`Invalid semantic version: ${version}`)
  return match.slice(1).map(Number) as [number, number, number]
}

const bumpVersion = (currentVersion: string, bump: Bump) => {
  const [major, minor, patch] = parseVersion(currentVersion)
  if (bump === "major") return `${major + 1}.0.0`
  if (bump === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

const isGreaterVersion = (candidate: string, current: string) => {
  const candidateParts = parseVersion(candidate)
  const currentParts = parseVersion(current)

  for (let index = 0; index < candidateParts.length; index += 1) {
    if (candidateParts[index] !== currentParts[index]) {
      return candidateParts[index] > currentParts[index]
    }
  }

  return false
}

const latestReleaseTag = run(
  "git",
  ["tag", "--merged", "HEAD", "--list", "v[0-9]*", "--sort=-version:refname"],
  true
)
  .split("\n")
  .find((tag) => versionPattern.test(tag.slice(1)))
const revisionRange = latestReleaseTag ? `${latestReleaseTag}..HEAD` : "HEAD"
const commits = run("git", ["log", revisionRange, "--format=%B%x00"], true)
  .split("\0")
  .map((message) => message.trim())
  .filter(Boolean)

const calculateBump = (): Bump => {
  let bump: Bump | undefined

  for (const message of commits) {
    const subject = message.split("\n", 1)[0]
    const typeMatch = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<breaking>!)?:/.exec(subject)
    const type = typeMatch?.groups?.type
    const isBreaking = Boolean(typeMatch?.groups?.breaking) || /\nBREAKING CHANGE:/.test(message)

    if (isBreaking) return "major"
    if (type === "feat") bump = bump ?? "minor"
    if (supportedTypes.has(type ?? "") && !bump) bump = "patch"
  }

  if (bump) return bump

  throw new Error(
    `No releasable conventional commits found since ${latestReleaseTag ?? "the first commit"}. ` +
      "Use bun release <patch|minor|major|x.y.z> to override."
  )
}

const packageChanges = Bun.spawnSync(["git", "diff", "--quiet", "--", "package.json"], {
  cwd: root,
})
const stagedPackageChanges = Bun.spawnSync(["git", "diff", "--cached", "--quiet", "--", "package.json"], {
  cwd: root,
})
if (!packageChanges.success || !stagedPackageChanges.success) {
  fail("package.json has uncommitted changes. Commit or discard them before releasing.")
}

const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson
if (!versionPattern.test(packageJson.version)) {
  fail(`package.json has an invalid semantic version: ${packageJson.version}`)
}

const release = (() => {
  if (!requestedBump) {
    const calculatedBump = calculateBump()
    return {
      version: bumpVersion(packageJson.version, calculatedBump),
      description: `calculated ${calculatedBump} bump`,
    }
  }

  if (["major", "minor", "patch"].includes(requestedBump)) {
    return {
      version: bumpVersion(packageJson.version, requestedBump as Bump),
      description: `manual ${requestedBump} bump`,
    }
  }

  if (!isGreaterVersion(requestedBump, packageJson.version)) {
    return fail(`Manual version must be greater than ${packageJson.version}.`)
  }

  return { version: requestedBump, description: "manual version override" }
})()
const { version, description: releaseDescription } = release

const branch = run("git", ["branch", "--show-current"], true).trim()
if (!branch) fail("Cannot release from a detached HEAD. Check out a branch first.")

packageJson.version = version
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

run("git", ["add", "package.json"])
run("git", ["commit", "-m", `chore: release v${version}`])
run("git", ["push", "origin", branch])
run("gh", ["workflow", "run", "release.yml", "--ref", branch, "--field", `version=${version}`])

console.log(`Release v${version} dispatched from ${branch} (${releaseDescription}).`)
