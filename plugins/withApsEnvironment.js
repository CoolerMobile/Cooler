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
 * This plugin re-creates the split on every prebuild so it survives
 * `bun clean:native`:
 *   - Debug  -> <App>.entitlements         (aps-environment: development)
 *   - Release-> <App>Release.entitlements  (aps-environment: production)
 *
 * The Release file mirrors the entitlements the Debug file carries (currently
 * just associated domains). If you add a new entitlement in app.json, make sure
 * it is reflected here too, or add it to `releaseEntitlements` below.
 */

const RELEASE_SUFFIX = "Release.entitlements"

/** force the shared (Debug) entitlements onto the development APNs environment */
const withDebugApsEnvironment = (config) =>
  withEntitlementsPlist(config, (cfg) => {
    cfg.modResults["aps-environment"] = "development"
    return cfg
  })

/** build a parallel Release entitlements file and point the Release config at it */
const withReleaseApsEnvironment = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    const projectName = cfg.modRequest.projectName
    const appDir = path.join(cfg.modRequest.platformProjectRoot, projectName)
    const releaseFileName = `${projectName}${RELEASE_SUFFIX}`

    // Release entitlements = everything Debug has, but production APNs.
    const releaseEntitlements = {
      "aps-environment": "production",
    }
    const associatedDomains = cfg.ios?.associatedDomains
    if (associatedDomains?.length) {
      releaseEntitlements["com.apple.developer.associated-domains"] = associatedDomains
    }

    const build = plist.default?.build ?? plist.build
    fs.writeFileSync(path.join(appDir, releaseFileName), build(releaseEntitlements))

    // Repoint only the app target's Release configuration. Project-level and
    // Pods configurations have no CODE_SIGN_ENTITLEMENTS, so they are skipped.
    const configurations = project.pbxXCBuildConfigurationSection()
    for (const key of Object.keys(configurations)) {
      const entry = configurations[key]
      if (typeof entry !== "object" || !entry.buildSettings) continue
      if (entry.name === "Release" && entry.buildSettings.CODE_SIGN_ENTITLEMENTS) {
        entry.buildSettings.CODE_SIGN_ENTITLEMENTS = `${projectName}/${releaseFileName}`
      }
    }

    return cfg
  })

/** @param {import('@expo/config-plugins').ExpoConfig} config */
module.exports = (config) => withReleaseApsEnvironment(withDebugApsEnvironment(config))
