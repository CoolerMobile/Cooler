# EAS Checklist: Notification Service Extension

Cooler ships an iOS notification service extension (`NotificationService`, bundle ID `app.getcooler.Cooler.NotificationService`). It has its own bundle ID, provisioning profile and entitlements, so builds need a few extra checks. Release scripts run EAS with `--non-interactive`, which cannot create credentials, so the one-time steps must happen first.

## One time

- [ ] **Sync the native project, then commit it.** Run `just sync`, review `git status ios android` and commit the result. EAS builds the committed tree, not your working copy, so an uncommitted `ios/Podfile.lock` fails with "CocoaPods could not find compatible versions". Every build recipe now refuses to start from a dirty tree and offers to push unpushed commits, so this can no longer slip through silently.
  - `ios/Settings.bundle` license files may show as deleted. They are build output that the LicensePlist build phase regenerates, so `git checkout -- ios/Settings.bundle` keeps the commit focused.
  - Check that `ios/sentry.properties` and `android/sentry.properties` still point at `https://tracking.danfq.dev/` (they come from the `@sentry/react-native` plugin options in `app.json`).
  - Expect `ios/Cooler/Info.plist` to change. Check `NSMicrophoneUsageDescription`: `expo-camera` adds it by default, but Cooler never records audio. To drop it, set `"microphonePermission": false` in the `expo-camera` plugin options in `app.json` and sync again.
  - Confirm `ios/Cooler.xcodeproj/project.pbxproj` still has a `NotificationService` target and four `MARKETING_VERSION` entries (the release script checks for exactly four).
- [ ] **Create the extension's credentials.** Run one interactive build so EAS can register the new bundle ID and generate its provisioning profile:

  ```sh
  bunx eas-cli@latest build --local --platform ios --profile production
  ```

  Answer yes when EAS offers to generate credentials for `NotificationService`. `bunx eas-cli@latest credentials --platform ios` works too.
- [ ] **Verify the credentials.** `bunx eas-cli@latest credentials --platform ios` should list both targets, `Cooler` and `NotificationService`, each with the distribution certificate and an App Store provisioning profile.

The extension needs no APNs key or capability of its own. Pushes are addressed to the app, and the keychain group (`$(AppIdentifierPrefix)app.getcooler.Cooler.push`) is allowed by the team's default profiles.

## Every release

- [ ] **Check the built IPA** before submitting:

  ```sh
  rm -rf /tmp/ipa && unzip -q path/to/build.ipa -d /tmp/ipa
  APP=/tmp/ipa/Payload/Cooler.app

  # both must print the same build number
  /usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$APP/Info.plist"
  /usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$APP/PlugIns/NotificationService.appex/Info.plist"

  # app: aps-environment production plus both keychain groups
  codesign -d --entitlements - "$APP"

  # extension: the .push keychain group
  codesign -d --entitlements - "$APP/PlugIns/NotificationService.appex"
  ```

- [ ] **Test on a real device from TestFlight**, with the app swiped away:
  - [ ] Send a test notification from Coolify. The banner shows the real title, not "New Coolify event".
  - [ ] Turn on quiet hours covering now and send another. Nothing arrives, and the event appears in the archive after opening the app.
  - [ ] Turn off one alert category and trigger that event type. Nothing arrives.

## Rollout order

1. Release the app first. The new app works with bridges that have not been updated.
2. Release the bridge afterwards. On an updated bridge, older apps only show the generic iOS alert, and older Android apps show nothing. Ask self-hosters to update the app before the bridge.
3. The bridge applies its new database columns itself (`db:push` runs when the container starts).
