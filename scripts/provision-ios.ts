import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * provisions the app extensions for local device builds
 *
 * `expo run` only lets xcode create provisioning profiles when it configures
 * signing itself, and it skips that whenever the project already names a team,
 * which app.json's appleTeamId always does. the app target had a profile from
 * xcode, but every extension (NotificationService) failed with "no profiles
 * found"
 *
 * so each extension target is built once on its own with provisioning allowed,
 * which has xcode create or renew its development profile. extensions only use
 * system frameworks, so this takes seconds and never needs cocoapods
 */

const root = join(import.meta.dir, "..")
const project = join(root, "ios", "Cooler.xcodeproj")

/**
 * runs a command from the repo root, exiting with its output on failure
 *
 * @param command command and arguments
 *
 * @returns {string} stdout
 */
const run = (command: string[]): string => {
  const result = Bun.spawnSync(command, { cwd: root, stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) {
    const output = `${result.stdout.toString()}\n${result.stderr.toString()}`
    const errors = output.split("\n").filter((line) => /error:/.test(line))
    console.error((errors.length > 0 ? errors : output.trim().split("\n").slice(-20)).join("\n"))
    process.exit(result.exitCode ?? 1)
  }
  return result.stdout.toString()
}

// the native project is generated, create it when missing (after clean:native)
if (!existsSync(project)) {
  console.info("Generating the iOS project...")
  run(["bunx", "expo", "prebuild", "--platform", "ios"])
}

// every target but the app itself is an extension
const { project: listed } = JSON.parse(run(["xcodebuild", "-list", "-json", "-project", project])) as {
  project: { name: string; targets: string[] }
}
const extensions = listed.targets.filter((target) => target !== listed.name)

// build products go to a throwaway directory, only the profiles are wanted
const scratch = mkdtempSync(join(tmpdir(), "cooler-provision-"))

try {
  for (const target of extensions) {
    console.info(`Provisioning ${target}...`)
    run([
      "xcodebuild",
      "-project",
      project,
      "-target",
      target,
      "-configuration",
      "Debug",
      "-sdk",
      "iphoneos",
      "-allowProvisioningUpdates",
      "-allowProvisioningDeviceRegistration",
      `SYMROOT=${scratch}`,
      `OBJROOT=${join(scratch, "obj")}`,
      "build",
    ])
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
