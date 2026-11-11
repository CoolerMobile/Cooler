import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

type Bump = "major" | "minor" | "patch"
type Platform = "android" | "ios"

type PackageJson = {
  version: string
  [key: string]: unknown
}

type AppJson = {
  expo: {
    version: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

type StoreConfig = {
  apple?: {
    version?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

const root = join(import.meta.dir, "..")
const packagePath = join(root, "package.json")
const appConfigPath = join(root, "app.json")
const androidBuildGradlePath = join(root, "android", "app", "build.gradle")
const iosInfoPlistPath = join(root, "ios", "Cooler", "Info.plist")
const iosProjectPath = join(root, "ios", "Cooler.xcodeproj", "project.pbxproj")
const storeConfigPath = join(root, "store.config.json")
const versionedPaths = [packagePath, appConfigPath, androidBuildGradlePath, iosInfoPlistPath, iosProjectPath]
const versionedFiles = versionedPaths.map((path) => path.slice(root.length + 1))
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

const usage = [
  "Usage:",
  "  bun release [options] [patch|minor|major|x.y.z]",
  "",
  "Options:",
  "  --android     Build only for Android",
  "  --ios         Build only for iOS",
  "  --submit      Submit iOS to TestFlight and Google Play",
  "  --nightly     Create a nightly/internal build",
  "  --eas           Dispatch the existing EAS GitHub workflow",
  "  --local         Build locally (the default)",
  "  --bump-only     Only update app and native versions, then print the new version",
  "  --push-metadata Also push the store listing + What's New to App Store Connect",
  "",
  "Store metadata (listing text + App Store \"What's New\") is pushed only on demand:",
  "add --push-metadata to an iOS store submission (--ios --submit --push-metadata).",
  "When pushing, the \"What's New\" is shown for review and must be confirmed before",
  "building. It reuses releaseNotes from store.config.json if set, else drafts them",
  "from commits. Set WHATS_NEW_YES=1 to skip the prompt (non-interactive).",
  "",
  "Examples:",
  "  bun release",
  "  bun release patch",
  "  bun release --nightly",
  "  bun release --ios",
  "  bun release --ios --submit",
  "  bun release --ios --submit --push-metadata",
  "  bun release --android --submit",
  "  bun release --android --ios",
  "  bun release --android --ios --submit",
  "  bun release --eas --android --ios",
  "  bun release --eas --submit",
  "  bun release --local --submit",
  "  bun release --ios --nightly",
].join("\n")

const args = Bun.argv.slice(2)

const useEas = args.includes("--eas")
const ios = args.includes("--ios")
const android = args.includes("--android")
const useLocal = args.includes("--local")
const submit = args.includes("--submit")
const nightly = args.includes("--nightly")
const bumpOnly = args.includes("--bump-only")
const pushMetadata = args.includes("--push-metadata")

// --android --ios (in either order) targets both platforms in one run
const both = ios && android

const knownFlags = new Set([
  "--eas",
  "--local",
  "--android",
  "--ios",
  "--submit",
  "--nightly",
  "--bump-only",
  "--push-metadata",
])

const unknownFlags = args.filter((arg) => arg.startsWith("--") && !knownFlags.has(arg))

const positionalArgs = args.filter((arg) => !arg.startsWith("--"))

if (unknownFlags.length > 0 || positionalArgs.length > 1) {
  throw new Error(usage)
}

if (useEas && bumpOnly) {
  throw new Error("--eas cannot be combined with --bump-only.\n\n" + usage)
}

if (useEas && useLocal) {
  throw new Error("--eas cannot be combined with --local.\n\n" + usage)
}

if (submit && nightly) {
  throw new Error(
    "--submit cannot be used with --nightly because nightly builds are not submitted to app stores.\n\n" +
      usage
  )
}

if (pushMetadata && bumpOnly) {
  throw new Error("--push-metadata cannot be combined with --bump-only.\n\n" + usage)
}

if (pushMetadata && !submit) {
  throw new Error(
    "--push-metadata only applies to a store submission; add --submit (store metadata pushes alongside the iOS submission).\n\n" +
      usage
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

const replaceVersion = (
  contents: string,
  pattern: RegExp,
  version: string,
  expectedMatches: number,
  file: string
) => {
  let matches = 0
  const updated = contents.replace(pattern, (_match, prefix: string, suffix: string) => {
    matches += 1
    return `${prefix}${version}${suffix}`
  })

  if (matches !== expectedMatches) {
    fail(`Expected ${expectedMatches} version field(s) in ${file}, found ${matches}.`)
  }

  return updated
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
  let [major, minor, patch] = parseVersion(currentVersion)

  if (bump === "major") {
    return `${major + 1}.0.0`
  }

  if (bump === "minor") {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }

  // Roll a saturated segment (9) over into the next one up. Patch 9 -> 0 carries
  // into minor, minor 9 -> 0 carries into major. Major is never capped.
  if (patch > 9) {
    patch = 0
    minor += 1
  }

  if (minor > 9) {
    minor = 0
    major += 1
  }

  return `${major}.${minor}.${patch}`
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
  for (const file of versionedFiles) {
    const changes = Bun.spawnSync(["git", "diff", "--quiet", "--", file], { cwd: root })
    const stagedChanges = Bun.spawnSync(["git", "diff", "--cached", "--quiet", "--", file], {
      cwd: root,
    })

    if (!changes.success || !stagedChanges.success) {
      fail(`${file} has uncommitted changes. Commit or discard them before releasing.`)
    }
  }

  const originalFiles = new Map(versionedPaths.map((path) => [path, readFileSync(path, "utf8")]))
  const originalPackage = originalFiles.get(packagePath) ?? fail("Could not read package.json.")

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

  const originalAppConfig = originalFiles.get(appConfigPath) ?? fail("Could not read app.json.")
  const originalAndroidBuildGradle =
    originalFiles.get(androidBuildGradlePath) ?? fail("Could not read android/app/build.gradle.")
  const originalIosInfoPlist =
    originalFiles.get(iosInfoPlistPath) ?? fail("Could not read ios/Cooler/Info.plist.")
  const originalIosProject =
    originalFiles.get(iosProjectPath) ?? fail("Could not read ios/Cooler.xcodeproj/project.pbxproj.")

  const appConfig = JSON.parse(originalAppConfig) as AppJson

  if (!appConfig.expo || typeof appConfig.expo.version !== "string") {
    fail("app.json is missing expo.version.")
  }

  appConfig.expo.version = version

  const androidBuildGradle = replaceVersion(
    originalAndroidBuildGradle,
    /(\bversionName\s+["'])[^"']+(["'])/g,
    version,
    1,
    "android/app/build.gradle"
  )

  const iosInfoPlist = replaceVersion(
    originalIosInfoPlist,
    /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/g,
    version,
    1,
    "ios/Cooler/Info.plist"
  )

  const iosProject = replaceVersion(
    originalIosProject,
    /(\bMARKETING_VERSION = )[^;]+(;)/g,
    version,
    2,
    "ios/Cooler.xcodeproj/project.pbxproj"
  )

  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
  writeFileSync(appConfigPath, `${JSON.stringify(appConfig, null, 2)}\n`)
  writeFileSync(androidBuildGradlePath, androidBuildGradle)
  writeFileSync(iosInfoPlistPath, iosInfoPlist)
  writeFileSync(iosProjectPath, iosProject)

  // bump the App Store version string (apple.version) in store.config.json so the
  // listing tracks the same version as git. kept out of the clean-check above because
  // store.config.json also carries releaseNotes that reviewWhatsNew may touch in the
  // same run; captured in originalFiles so a failed build restores it too.
  try {
    const originalStoreConfig = readFileSync(storeConfigPath, "utf8")
    const storeConfig = JSON.parse(originalStoreConfig) as StoreConfig

    if (storeConfig.apple && typeof storeConfig.apple.version === "string") {
      originalFiles.set(storeConfigPath, originalStoreConfig)
      storeConfig.apple.version = version
      writeFileSync(storeConfigPath, `${JSON.stringify(storeConfig, null, 2)}\n`)
    }
  } catch {
    // store.config.json is optional; skip the bump when it is absent
  }

  return {
    version,
    description,
    originalFiles,
  }
}

const restoreVersionFiles = (originalFiles: Map<string, string>) => {
  for (const [path, contents] of originalFiles) writeFileSync(path, contents)
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

const platforms: Platform[] = both
  ? ["android", "ios"]
  : ios
    ? ["ios"]
    : android
      ? ["android"]
      : submit
        ? ["android", "ios"]
        : ["android"]

// ── App Store "What's New": generate (or reuse), SHOW, and confirm ──
// Only when metadata will actually be pushed (--push-metadata) for a store-submitted
// iOS release — there is no point reviewing notes we are not going to publish. Reuses
// existing releaseNotes in store.config.json if present (e.g. notes already polished by
// the app-store-submit skill); otherwise drafts them from commits. No em-dashes.
// Returns whether store.config.json was modified (so the --eas path can commit it).
// Aborts the whole run (exit 0) if the notes are not approved.
const reviewWhatsNew = (): { wroteStoreConfig: boolean } => {
  const storeConfigPath = join(root, "store.config.json")

  let originalStoreConfig = ""
  try {
    originalStoreConfig = readFileSync(storeConfigPath, "utf8")
  } catch {
    fail("store.config.json not found. Run `eas metadata:pull` first (What's New lives there).")
  }

  const storeConfig = JSON.parse(originalStoreConfig) as {
    apple?: { info?: Record<string, { releaseNotes?: string } | undefined> }
  }

  const info = storeConfig.apple?.info ?? {}
  const locales = Object.keys(info)

  if (locales.length === 0) {
    fail("store.config.json has no apple.info locales. Run `eas metadata:pull` first.")
  }

  // Never emit em/en dashes in user-facing copy.
  const stripDashes = (text: string) => text.replace(/\s*[—–]\s*/g, ": ")

  const primaryLocale = locales.includes("en-US") ? "en-US" : locales[0]
  const existing = (info[primaryLocale]?.releaseNotes ?? "").trim()

  let notes: string
  let source: string
  let wroteStoreConfig = false

  if (existing) {
    notes = stripDashes(existing)
    source = `existing store.config.json (${primaryLocale})`
  } else {
    const reference = latestReleaseReference()
    const range = reference ? `${reference}..HEAD` : "HEAD"
    const script = join(root, ".claude", "skills", "app-store-submit", "whats-new.sh")
    notes = stripDashes(run("bash", [script, "--notes", range], true).trim())
    for (const locale of locales) info[locale] = { ...info[locale], releaseNotes: notes }
    writeFileSync(storeConfigPath, `${JSON.stringify(storeConfig, null, 2)}\n`)
    wroteStoreConfig = true
    source = `generated from commits (${range})`
  }

  console.log(`\n===== App Store "What's New"  [${source}] =====\n`)
  console.log(notes)
  console.log(`\n==============================================\n`)

  const assumeYes = process.env.WHATS_NEW_YES === "1"
  let approved = assumeYes

  if (assumeYes) {
    console.log("WHATS_NEW_YES=1 set; continuing without a prompt.")
  } else if (!process.stdin.isTTY) {
    fail(
      "Cannot confirm release notes without a terminal. Re-run `bun release` interactively, " +
        "or review store.config.json and set WHATS_NEW_YES=1."
    )
  } else {
    const answer = (prompt("Proceed with these release notes? [y/N]") ?? "").trim().toLowerCase()
    approved = answer === "y" || answer === "yes"
  }

  if (!approved) {
    if (wroteStoreConfig) writeFileSync(storeConfigPath, originalStoreConfig)
    console.log(
      "Aborted. Edit store.config.json (or run the app-store-submit skill to polish the notes), then re-run."
    )
    process.exit(0)
  }

  if (wroteStoreConfig) {
    run("bunx", ["eas-cli@latest", "metadata:lint"])
  }

  return { wroteStoreConfig }
}

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
if (useEas) {
  const bump = requestedBump ?? "auto"
  // Keep workflow dispatch compatible with the deployed input schema. "both"
  // builds both platforms; android + submit also expands to both so a plain
  // --submit still ships iOS, while an explicit --android release sends
  // submit=false because there is no store submission yet.
  const platform = both ? "both" : ios ? "ios" : "android"
  const workflowSubmit = submit && (both || !android)
  const pushMetadataRemote = pushMetadata && workflowSubmit

  // Review the What's New here in the terminal BEFORE dispatching to CI, then
  // commit store.config.json so the CI run (which checks out this branch) pushes
  // exactly what you saw. CI itself has no interactive prompt. We commit whenever
  // the file has uncommitted content — whether reviewWhatsNew regenerated it or it
  // was just never tracked — otherwise the CI metadata job would not see it.
  if (pushMetadataRemote && platforms.includes("ios")) {
    reviewWhatsNew()

    run("git", ["add", "store.config.json"])

    const staged = Bun.spawnSync(["git", "diff", "--cached", "--quiet", "--", "store.config.json"], {
      cwd: root,
    })

    // diff --cached --quiet exits non-zero when there are staged changes to commit.
    if (!staged.success) {
      run("git", ["commit", "-m", "chore: update App Store What's New"])
    }
  }

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
    `submit=${workflowSubmit}`,
    "--field",
    `push_metadata=${pushMetadataRemote}`,
    "--field",
    `bump=${bump}`,
  ])

  const submissionDescription = !submit
    ? ""
    : both
      ? ", TestFlight submission enabled; Google Play submission skipped"
      : android
        ? ", Google Play submission skipped because a developer account is not configured"
        : ios
          ? ", TestFlight submission enabled"
          : ", TestFlight submission enabled; Google Play submission skipped"

  const metadataDescription = pushMetadataRemote
    ? ", store metadata (listing + What's New) reviewed and queued for CI push"
    : ""

  console.log(
    `EAS ${channel} ${platform} release dispatched from ${branch} (${bump} bump${submissionDescription}${metadataDescription}).`
  )

  process.exit(0)
}

// Local build path: review the What's New before building. (The --eas path above
// already reviewed and committed it before dispatching to CI.)
if (submit && pushMetadata && platforms.includes("ios")) {
  reviewWhatsNew()
}

const releaseNotes = createReleaseNotes()

const { version, description: releaseDescription, originalFiles } = prepareVersion()

const artifactDirectory = join(root, "artifacts")

const artifacts = platforms.map((platform) => ({
  platform,
  buildProfile: platform === "ios" ? (nightly ? "nightly" : "production") : channel,
  output: join(
    artifactDirectory,
    `Cooler-${channel}-${version}-${platform}.${platform === "ios" ? "ipa" : "apk"}`
  ),
}))

const releaseNotesPath = join(artifactDirectory, "release-notes.md")

mkdirSync(artifactDirectory, {
  recursive: true,
})

try {
  run("bun", ["scripts/licenses.ts"])

  for (const { platform, buildProfile, output } of artifacts) {
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
  }
} catch (error) {
  restoreVersionFiles(originalFiles)

  throw error
}

run("git", ["add", ...versionedFiles, "store.config.json"])

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
  ...artifacts.map(({ output }) => output),
  "--target",
  releaseCommit,
  "--title",
  title,
  "--notes-file",
  releaseNotesPath,
  ...(nightly ? ["--prerelease"] : ["--latest"]),
])

console.log(`${title} built and published from ${branch} (${releaseDescription}).`)

for (const { output } of artifacts) console.log(`Artifact: ${output}`)

const iosArtifact = artifacts.find(({ platform }) => platform === "ios")

if (submit && iosArtifact) {
  console.log(`Submitting Cooler v${version} to App Store Connect/TestFlight...`)

  // the shared submit step, the same one the eas workflow runs
  run("bun", ["scripts/submit-ios.ts", iosArtifact.output])

  if (pushMetadata) {
    // Sync the store listing + the "What's New" (store.config.json) that was
    // reviewed and confirmed earlier in this run. Only on demand (--push-metadata).
    console.log("Pushing store metadata (listing + What's New) to App Store Connect...")
    run("bunx", ["eas-cli@latest", "metadata:push", "--non-interactive"])
    console.log("Store listing and What's New synced to App Store Connect.")
  } else {
    console.log(
      "Store metadata (listing + What's New) was not pushed. Push it on demand with " +
        "`bun release --ios --submit --push-metadata`, or directly with `eas metadata:push` " +
        "after reviewing store.config.json (`eas metadata:lint`)."
    )
  }
}

if (submit && platforms.includes("android")) {
  console.log(
    `Cooler v${version} was not submitted to Google Play because a Google Play Developer account is not configured.`
  )
}
