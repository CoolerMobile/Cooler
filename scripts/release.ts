import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

type Bump = "major" | "minor" | "patch"
type Platform = "android" | "ios"

type PackageJson = {
  version: string
  [key: string]: unknown
}

const root = join(import.meta.dir, "..")
const packagePath = join(root, "package.json")
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

const usage = [
  "Usage:",
  "  bun release [options] [patch|minor|major|x.y.z]",
  "",
  "Options:",
  "  --ios         Build for iOS instead of Android",
  "  --submit      Submit the resulting iOS IPA to TestFlight",
  "  --nightly     Create a nightly/internal build",
  "  --eas         Dispatch the existing EAS GitHub workflow",
  "  --bump-only   Only update package.json and print the new version",
  "",
  "Examples:",
  "  bun release",
  "  bun release patch",
  "  bun release --nightly",
  "  bun release --ios",
  "  bun release --ios --submit",
  "  bun release --ios --nightly",
].join("\n")

const args = Bun.argv.slice(2)

const useEas = args.includes("--eas")
const ios = args.includes("--ios")
const submit = args.includes("--submit")
const nightly = args.includes("--nightly")
const bumpOnly = args.includes("--bump-only")

const knownFlags = new Set(["--eas", "--ios", "--submit", "--nightly", "--bump-only"])

const unknownFlags = args.filter((arg) => arg.startsWith("--") && !knownFlags.has(arg))

const positionalArgs = args.filter((arg) => !arg.startsWith("--"))

if (unknownFlags.length > 0 || positionalArgs.length > 1) {
  throw new Error(usage)
}

if (useEas && bumpOnly) {
  throw new Error("--eas cannot be combined with --bump-only.\n\n" + usage)
}

if (submit && !ios) {
  throw new Error("--submit currently only applies to iOS/TestFlight.\n\n" + usage)
}

if (submit && nightly) {
  throw new Error(
    "--submit cannot be used with --nightly because nightly iOS builds use internal distribution.\n\n" + usage
  )
}

const requestedBump = positionalArgs[0] === "auto" ? undefined : positionalArgs[0]

if (
  requestedBump &&
  !["major", "minor", "patch"].includes(requestedBump) &&
  !versionPattern.test(requestedBump)
) {
  throw new Error(usage)
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

const run = (command: string, commandArgs: string[], captureOutput = false) => {
  const result = Bun.spawnSync([command, ...commandArgs], {
    cwd: root,
    stdout: captureOutput ? "pipe" : "inherit",
    stderr: "inherit",
  })

  if (!result.success) {
    fail(`Command failed: ${command} ${commandArgs.join(" ")}`)
  }

  return captureOutput ? new TextDecoder().decode(result.stdout) : ""
}

const parseVersion = (version: string): [number, number, number] => {
  const match = versionPattern.exec(version)

  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`)
  }

  return match.slice(1).map(Number) as [number, number, number]
}

const bumpVersion = (currentVersion: string, bump: Bump) => {
  const [major, minor, patch] = parseVersion(currentVersion)

  if (bump === "major") {
    return `${major + 1}.0.0`
  }

  if (bump === "minor") {
    return `${major}.${minor + 1}.0`
  }

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

const latestReleaseTag = () =>
  run("git", ["tag", "--merged", "HEAD", "--list", "v[0-9]*", "nightly-v[0-9]*", "--sort=-creatordate"], true)
    .split("\n")
    .find((tag) => versionPattern.test(tag.startsWith("nightly-v") ? tag.slice(9) : tag.slice(1)))

const latestReleaseReference = () =>
  latestReleaseTag() ??
  (run("git", ["log", "HEAD", "--format=%H", "--grep=^chore: release ", "-n", "1"], true).trim() || undefined)

const createReleaseNotes = () => {
  const previousRelease = latestReleaseReference()

  const revisionRange = previousRelease ? `${previousRelease}..HEAD` : "HEAD"

  const commits = run("git", ["log", revisionRange, "--format=%H%x09%h%x09%s%x09%an"], true)
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"))

  const changes = commits.length
    ? commits
        .map(
          ([sha, shortSha, subject, author]) =>
            `- ${subject} - ${author} ([${shortSha}](https://github.com/CoolerMobile/Cooler/commit/${sha}))`
        )
        .join("\n")
    : "- No commits since the previous release."

  return `## Changes\n\n${changes}\n`
}

const calculateBump = (): Bump => {
  const previousRelease = latestReleaseReference()

  const revisionRange = previousRelease ? `${previousRelease}..HEAD` : "HEAD"

  const commits = run("git", ["log", revisionRange, "--format=%B%x00"], true)
    .split("\0")
    .map((message) => message.trim())
    .filter(Boolean)

  let bump: Bump | undefined

  for (const message of commits) {
    const subject = message.split("\n", 1)[0]

    const typeMatch = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<breaking>!)?:/.exec(subject)

    const type = typeMatch?.groups?.type

    const isBreaking = Boolean(typeMatch?.groups?.breaking) || /\nBREAKING CHANGE:/.test(message)

    if (isBreaking) {
      return "major"
    }

    if (type === "feat") {
      bump = bump ?? "minor"
    }

    if (supportedTypes.has(type ?? "") && !bump) {
      bump = "patch"
    }
  }

  if (bump) {
    return bump
  }

  throw new Error(
    `No releasable conventional commits found since ${previousRelease ?? "the first commit"}. ` +
      "Use bun release <patch|minor|major|x.y.z> to override."
  )
}

const prepareVersion = () => {
  const packageChanges = Bun.spawnSync(["git", "diff", "--quiet", "--", "package.json"], {
    cwd: root,
  })

  const stagedPackageChanges = Bun.spawnSync(["git", "diff", "--cached", "--quiet", "--", "package.json"], {
    cwd: root,
  })

  if (!packageChanges.success || !stagedPackageChanges.success) {
    fail("package.json has uncommitted changes. Commit or discard them before releasing.")
  }

  const originalPackage = readFileSync(packagePath, "utf8")

  const packageJson = JSON.parse(originalPackage) as PackageJson

  if (!versionPattern.test(packageJson.version)) {
    fail(`package.json has an invalid semantic version: ${packageJson.version}`)
  }

  let version: string
  let description: string

  if (!requestedBump) {
    const calculatedBump = calculateBump()

    version = bumpVersion(packageJson.version, calculatedBump)

    description = `calculated ${calculatedBump} bump`
  } else if (["major", "minor", "patch"].includes(requestedBump)) {
    version = bumpVersion(packageJson.version, requestedBump as Bump)

    description = `manual ${requestedBump} bump`
  } else {
    if (!isGreaterVersion(requestedBump, packageJson.version)) {
      fail(`Manual version must be greater than ${packageJson.version}.`)
    }

    version = requestedBump
    description = "manual version override"
  }

  packageJson.version = version

  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

  return {
    version,
    description,
    originalPackage,
  }
}

const currentBranch = () => {
  const branch = run("git", ["branch", "--show-current"], true).trim()

  if (!branch) {
    fail("Cannot release from a detached HEAD. Check out a branch first.")
  }

  return branch
}

if (bumpOnly) {
  process.stdout.write(prepareVersion().version)
  process.exit(0)
}

const branch = currentBranch()

const channel = nightly ? "nightly" : "release"

const platform: Platform = ios ? "ios" : "android"

const extension = platform === "ios" ? "ipa" : "apk"

/*
 * Android keeps the current behavior:
 *
 *   release -> EAS "release"
 *   nightly -> EAS "nightly"
 *
 * iOS is slightly different:
 *
 *   release -> EAS "production"
 *   nightly -> EAS "nightly"
 *
 * This lets normal iOS releases use App Store distribution
 * while nightly IPAs remain internally signed/sideloadable.
 */
const buildProfile = platform === "ios" ? (nightly ? "nightly" : "production") : channel

if (useEas) {
  const bump = requestedBump ?? "auto"

  run("git", ["push", "origin", branch])

  run("gh", [
    "workflow",
    "run",
    "release.yml",
    "--ref",
    branch,
    "--field",
    `channel=${channel}`,
    "--field",
    `platform=${platform}`,
    "--field",
    `submit=${submit}`,
    "--field",
    `bump=${bump}`,
  ])

  console.log(
    `EAS ${channel} ${platform} release dispatched from ${branch} (${bump} bump${submit ? ", TestFlight submission enabled" : ""}).`
  )

  process.exit(0)
}

const releaseNotes = createReleaseNotes()

const { version, description: releaseDescription, originalPackage } = prepareVersion()

const artifactDirectory = join(root, "artifacts")

const output = join(artifactDirectory, `Cooler-${channel}-${version}-${platform}.${extension}`)

const releaseNotesPath = join(artifactDirectory, "release-notes.md")

mkdirSync(artifactDirectory, {
  recursive: true,
})

try {
  let succeeded = false

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    rmSync(output, {
      force: true,
    })

    console.log(`Starting local ${platform} build with profile "${buildProfile}" (attempt ${attempt}/2).`)

    const result = Bun.spawnSync(
      [
        "bunx",
        "eas-cli@latest",
        "build",
        "--local",
        "--platform",
        platform,
        "--profile",
        buildProfile,
        "--non-interactive",
        "--output",
        output,
      ],
      {
        cwd: root,
        stdout: "inherit",
        stderr: "inherit",
      }
    )

    if (result.success) {
      succeeded = true
      break
    }

    if (attempt === 1) {
      console.error(`Local ${platform} build failed; retrying once.`)
    }
  }

  if (!succeeded) {
    fail(`Local ${platform} build failed twice; stopping without further retries.`)
  }
} catch (error) {
  writeFileSync(packagePath, originalPackage)

  throw error
}

run("git", ["add", "package.json"])

run("git", ["commit", "-m", `chore: release ${nightly ? "nightly " : ""}v${version}`])

run("git", ["push", "origin", branch])

const releaseCommit = run("git", ["rev-parse", "HEAD"], true).trim()

const tag = nightly ? `nightly-v${version}` : `v${version}`

const title = nightly ? `Cooler nightly v${version}` : `Cooler v${version}`

writeFileSync(releaseNotesPath, `${releaseNotes}\nBuilt from commit \`${releaseCommit}\`.\n`)

run("gh", [
  "release",
  "create",
  tag,
  output,
  "--target",
  releaseCommit,
  "--title",
  title,
  "--notes-file",
  releaseNotesPath,
  ...(nightly ? ["--prerelease"] : ["--latest"]),
])

console.log(`${title} built and published from ${branch} (${releaseDescription}).`)

console.log(`Artifact: ${output}`)

if (submit) {
  console.log(`Submitting Cooler v${version} to App Store Connect/TestFlight...`)

  run("bunx", [
    "eas-cli@latest",
    "submit",
    "--platform",
    "ios",
    "--path",
    output,
    "--profile",
    "production",
    "--non-interactive",
  ])

  console.log(
    `Cooler v${version} uploaded to App Store Connect. It should appear in TestFlight after Apple finishes processing it.`
  )
}
