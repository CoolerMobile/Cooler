const { withDangerousMod, withXcodeProject } = require("@expo/config-plugins")
const plist = require("@expo/plist")
const fs = require("fs")
const path = require("path")

/**
 * Add the notification service extension that presents bridge pushes.
 *
 * Bridge pushes only carry the event and bridge ids, behind a generic alert
 * with `mutable-content`. iOS runs this extension for every such push, even
 * when the app was swiped away, and it swaps the generic alert for the event
 * it fetches from the bridge with the device event token the app keeps in the
 * shared keychain group.
 *
 * Sources live in plugins/notification-service and are copied on every
 * prebuild, so the target survives `bun clean:native`. The app's own keychain
 * groups are declared under `ios.entitlements` in app.json.
 */

const TARGET_NAME = "NotificationService"
const SOURCE_DIR = path.join(__dirname, "notification-service")
const SWIFT_FILE = `${TARGET_NAME}.swift`
const INFO_PLIST_FILE = `${TARGET_NAME}-Info.plist`
const ENTITLEMENTS_FILE = `${TARGET_NAME}.entitlements`

/** keychain group shared with the app, see src/lib/storage/push-credentials.ts */
const keychainGroup = (bundleIdentifier) => `$(AppIdentifierPrefix)${bundleIdentifier}.push`

const extensionBundleIdentifier = (bundleIdentifier) => `${bundleIdentifier}.${TARGET_NAME}`

/**
 * write the extension sources and entitlements into the ios project
 *
 * @param {string} iosRoot ios project directory
 * @param {string} bundleIdentifier app bundle identifier
 */
const writeExtensionFiles = (iosRoot, bundleIdentifier) => {
  const targetDir = path.join(iosRoot, TARGET_NAME)
  fs.mkdirSync(targetDir, { recursive: true })

  for (const file of [SWIFT_FILE, INFO_PLIST_FILE]) {
    fs.copyFileSync(path.join(SOURCE_DIR, file), path.join(targetDir, file))
  }

  const build = plist.default?.build ?? plist.build
  fs.writeFileSync(
    path.join(targetDir, ENTITLEMENTS_FILE),
    build({ "keychain-access-groups": [keychainGroup(bundleIdentifier)] })
  )
}

/**
 * add the extension target, its build phases and its build settings
 *
 * the xcode library also embeds the product in the first (app) target and
 * makes the app depend on it
 *
 * @param project parsed xcode project
 * @param {{ bundleIdentifier: string, appleTeamId: string, version: string, buildNumber?: string }} app app settings
 */
const addExtensionTarget = (project, app) => {
  // already added by an earlier prebuild
  if (project.pbxTargetByName(TARGET_NAME)) return

  // the xcode library expects these sections when it wires the target dependency
  const objects = project.hash.project.objects
  objects.PBXTargetDependency ??= {}
  objects.PBXContainerItemProxy ??= {}

  // group shown in xcode, attached to the main group
  const files = [SWIFT_FILE, INFO_PLIST_FILE, ENTITLEMENTS_FILE]
  const { uuid: groupUuid, pbxGroup } = project.addPbxGroup(files, TARGET_NAME, TARGET_NAME)
  project.addToPbxGroup(groupUuid, project.getFirstProject().firstProject.mainGroup)

  // the group only needs file references, drop the build files it creates
  const fileRefs = new Set(pbxGroup.children.map((child) => child.value))
  const buildFiles = project.pbxBuildFileSection()
  for (const key of Object.keys(buildFiles)) {
    if (fileRefs.has(buildFiles[key]?.fileRef)) {
      delete buildFiles[key]
      delete buildFiles[`${key}_comment`]
    }
  }

  const target = project.addTarget(
    TARGET_NAME,
    "app_extension",
    TARGET_NAME,
    extensionBundleIdentifier(app.bundleIdentifier)
  )
  const { buildPhase: sources } = project.addBuildPhase(
    [SWIFT_FILE],
    "PBXSourcesBuildPhase",
    "Sources",
    target.uuid
  )

  // the sources phase makes its own reference outside the group, which would
  // resolve against the project root, so point it at the group's reference
  const swiftRef = pbxGroup.children.find((child) => child.comment === SWIFT_FILE).value
  const fileReferences = project.pbxFileReferenceSection()
  for (const { value } of sources.files) {
    const buildFile = buildFiles[value]
    if (buildFile.fileRef === swiftRef) continue

    delete fileReferences[buildFile.fileRef]
    delete fileReferences[`${buildFile.fileRef}_comment`]
    buildFile.fileRef = swiftRef
  }

  project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid)
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid)

  // match the app's deployment, signing and version settings
  const configurations = project.pbxXCBuildConfigurationSection()
  const appSettings = Object.values(configurations).find(
    (entry) =>
      typeof entry === "object" && entry.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER === app.bundleIdentifier
  )?.buildSettings

  for (const key of Object.keys(configurations)) {
    const entry = configurations[key]
    if (typeof entry !== "object" || entry.buildSettings?.PRODUCT_NAME !== `"${TARGET_NAME}"`) continue

    Object.assign(entry.buildSettings, {
      APPLICATION_EXTENSION_API_ONLY: "YES",
      CLANG_ENABLE_MODULES: "YES",
      CODE_SIGN_ENTITLEMENTS: `${TARGET_NAME}/${ENTITLEMENTS_FILE}`,
      CODE_SIGN_STYLE: "Automatic",
      CURRENT_PROJECT_VERSION: appSettings?.CURRENT_PROJECT_VERSION ?? app.buildNumber ?? "1",
      DEVELOPMENT_TEAM: app.appleTeamId,
      GENERATE_INFOPLIST_FILE: "NO",
      INFOPLIST_FILE: `${TARGET_NAME}/${INFO_PLIST_FILE}`,
      IPHONEOS_DEPLOYMENT_TARGET: appSettings?.IPHONEOS_DEPLOYMENT_TARGET ?? "16.4",
      MARKETING_VERSION: app.version,
      SWIFT_VERSION: "5.0",
      TARGETED_DEVICE_FAMILY: appSettings?.TARGETED_DEVICE_FAMILY ?? "1",
    })
  }

  project.addTargetAttribute("DevelopmentTeam", app.appleTeamId, target)
}

/** declare the extension so eas provisions it and keeps its build number in step */
const withEasAppExtension = (config) => {
  const eas = (config.extra ??= {}).eas ?? (config.extra.eas = {})
  const ios = (((eas.build ??= {}).experimental ??= {}).ios ??= {})
  const appExtensions = (ios.appExtensions ??= [])

  if (!appExtensions.some((extension) => extension.targetName === TARGET_NAME)) {
    appExtensions.push({
      targetName: TARGET_NAME,
      bundleIdentifier: extensionBundleIdentifier(config.ios.bundleIdentifier),
      entitlements: { "keychain-access-groups": [keychainGroup(config.ios.bundleIdentifier)] },
    })
  }

  return config
}

const withExtensionFiles = (config) =>
  withDangerousMod(config, [
    "ios",
    (cfg) => {
      writeExtensionFiles(cfg.modRequest.platformProjectRoot, cfg.ios.bundleIdentifier)
      return cfg
    },
  ])

const withExtensionTarget = (config) =>
  withXcodeProject(config, (cfg) => {
    addExtensionTarget(cfg.modResults, {
      bundleIdentifier: cfg.ios.bundleIdentifier,
      appleTeamId: cfg.ios.appleTeamId,
      version: cfg.version,
      buildNumber: cfg.ios.buildNumber,
    })
    return cfg
  })

/** @param {import('@expo/config-plugins').ExpoConfig} config */
module.exports = (config) => withExtensionTarget(withExtensionFiles(withEasAppExtension(config)))
module.exports.addExtensionTarget = addExtensionTarget
module.exports.writeExtensionFiles = writeExtensionFiles
