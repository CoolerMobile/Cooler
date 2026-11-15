const { withEntitlementsPlist, withXcodeProject } = require("@expo/config-plugins")
const plist = require("@expo/plist")
const fs = require("fs")
const path = require("path")

/**
 * Keep the APNs environment correct per build configuration.
 *
 * `expo prebuild` generates a single entitlements file shared by Debug and
 * Release. That forces one `aps-environment` value for both, which is wrong:
 * TestFlight/App Store builds (Release) must use `production` or push silently
 * breaks, while local dev-client builds (Debug) need `development`.
 *
 * This plugin re-creates the split on every prebuild, clean or not, so it
 * survives `just clean`:
 *   - Debug  -> <App>.entitlements         (aps-environment: development)
 *   - Release-> <App>Release.entitlements  (aps-environment: production)
 *
 * Expo always writes the final entitlements into the file the Release
 * configuration points at, after every other mod. So the Release file is left
 * to Expo with `production`, and the Debug file is written here from the same
 * final entitlements with `development`. Both files therefore always carry the
 * same entitlements apart from the APNs environment.
 */

const RELEASE_SUFFIX = "Release.entitlements"

const entitlementsFiles = (cfg) => {
  const projectName = cfg.modRequest.projectName
  const appDir = path.join(cfg.modRequest.platformProjectRoot, projectName)

  return {
    projectName,
    debug: {
      relative: `${projectName}/${projectName}.entitlements`,
      absolute: path.join(appDir, `${projectName}.entitlements`),
    },
    release: {
      relative: `${projectName}/${projectName}${RELEASE_SUFFIX}`,
      absolute: path.join(appDir, `${projectName}${RELEASE_SUFFIX}`),
    },
  }
}

/** point the app target's configurations at their own entitlements file */
const withEntitlementsFiles = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    const files = entitlementsFiles(cfg)

    // Expo only writes into a Release file that already exists
    const build = plist.default?.build ?? plist.build
    if (!fs.existsSync(files.release.absolute)) fs.writeFileSync(files.release.absolute, build({}))

    // Set both explicitly. On a clean prebuild Expo has not set them yet, and
    // extensions and Pods have their own configuration lists, so they are
    // never touched.
    const appTarget = project.getFirstTarget().firstTarget
    const configurationList = project.pbxXCConfigurationList()[appTarget.buildConfigurationList]
    const configurations = project.pbxXCBuildConfigurationSection()
    for (const { value } of configurationList.buildConfigurations) {
      const entry = configurations[value]
      entry.buildSettings.CODE_SIGN_ENTITLEMENTS =
        entry.name === "Release" ? files.release.relative : files.debug.relative
    }

    return cfg
  })

/** production APNs in the Release file Expo writes, a development copy for Debug */
const withSplitApsEnvironment = (config) =>
  withEntitlementsPlist(config, (cfg) => {
    const files = entitlementsFiles(cfg)
    const build = plist.default?.build ?? plist.build

    fs.writeFileSync(files.debug.absolute, build({ ...cfg.modResults, "aps-environment": "development" }))
    cfg.modResults["aps-environment"] = "production"

    return cfg
  })

/** @param {import('@expo/config-plugins').ExpoConfig} config */
module.exports = (config) => withSplitApsEnvironment(withEntitlementsFiles(config))
