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
 * The Release file mirrors the entitlements the Debug file carries: everything
 * under `ios.entitlements` in app.json (currently the keychain groups shared
 * with the notification service extension) plus associated domains. If you add
 * an entitlement some other way, add it to `releaseEntitlements` below too.
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
      ...cfg.ios?.entitlements,
      "aps-environment": "production",
    }
    const associatedDomains = cfg.ios?.associatedDomains
    if (associatedDomains?.length) {
      releaseEntitlements["com.apple.developer.associated-domains"] = associatedDomains
    }

    const build = plist.default?.build ?? plist.build
    fs.writeFileSync(path.join(appDir, releaseFileName), build(releaseEntitlements))

    // Repoint only the app target's Release configuration. Project-level and
    // Pods configurations have no CODE_SIGN_ENTITLEMENTS, and extensions sign
    // with their own entitlements, so both are skipped.
    const appEntitlements = [
      `${projectName}/${projectName}.entitlements`,
      `${projectName}/${releaseFileName}`,
    ]
    const configurations = project.pbxXCBuildConfigurationSection()
    for (const key of Object.keys(configurations)) {
      const entry = configurations[key]
      if (typeof entry !== "object" || !entry.buildSettings) continue
      const entitlements = String(entry.buildSettings.CODE_SIGN_ENTITLEMENTS ?? "").replace(/"/g, "")
      if (entry.name === "Release" && appEntitlements.includes(entitlements)) {
        entry.buildSettings.CODE_SIGN_ENTITLEMENTS = `${projectName}/${releaseFileName}`
      }
    }

    return cfg
  })

/** @param {import('@expo/config-plugins').ExpoConfig} config */
module.exports = (config) => withReleaseApsEnvironment(withDebugApsEnvironment(config))
