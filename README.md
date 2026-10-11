<div align="center">
  <img src="assets/expo.icon/Assets/logo.svg" alt="Cooler logo" width="180" style="border-radius: 24px;" />
  <h1>Cooler</h1>
  <p>Cooler is a native mobile companion for <a href="https://coolify.io">Coolify</a>. It gives you a focused way to check infrastructure health and manage deployments from your phone without needing the full Coolify dashboard.</p>
</div>

> [!NOTE]
> Cooler is prod-ready, at **v1.0.0**. The project is still evolving, and new features will continue to build on the core management experience.

## What Cooler does

- Connect to one or more Coolify instances.
- See servers, deployment targets, applications, databases, and services in one overview.
- Check connection, resource, and deployment health at a glance.
- Start, stop, and restart supported resources.
- Browse active deployments and deployment history.
- Filter deployments by server, project, and resource.
- Cancel, redeploy, or roll back deployments when supported by Coolify.
- Read deployment and resource logs.
- Watch a deployment and receive a local notification when it finishes.
- Configure notifications for deployments, backups, scheduled tasks, and server alerts.
- Protect sensitive actions and app access with biometrics.
- Hide sensitive values with a privacy control, including motion-based hiding where supported.
- Configure quiet hours and choose a light, dark, or system theme.

Cooler is designed for dependable day-to-day visibility and small operational actions while away from a desktop. It does not attempt to replace Coolify's complete administration dashboard.

## Download

The latest release is available from the [GitHub Releases](https://github.com/CoolerMobile/Cooler/releases) page. Releases include iOS and Android build artifacts when the release workflow completes successfully.

- `Cooler-<channel>-<version>-ios.ipa`
- `Cooler-<channel>-<version>-android.apk`

Nightly builds are published once a day and are intended for testing the latest changes. Stable release builds are created manually by project maintainers.

## Stack

- [React Native](https://reactnative.dev) and [Expo](https://expo.dev)
- [Expo Router](https://docs.expo.dev/router/introduction) for file-based navigation
- [TypeScript](https://www.typescriptlang.org)
- [Expo Development Builds](https://docs.expo.dev/develop/development-builds/introduction)
- [Expo UI](https://docs.expo.dev/versions/latest/sdk/ui/) for native platform components
- [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/)
- [EAS Build](https://docs.expo.dev/build/introduction/) for release artifacts
- [Bun](https://bun.sh) for package management and scripts

## Development

### Requirements

- [Bun](https://bun.sh)
- The platform tooling required by Expo for Android or iOS development
- A local or remote Coolify instance for integration work

### Install dependencies

```bash
bun install
```

### Start the development server

```bash
bun run dev
```

The project uses `expo-dev-client`. Create and install a development build before opening it for the first time:

```bash
bunx expo run:android
# or
bunx expo run:ios
```

After the native build is installed, `bun run dev` is enough for regular JavaScript and TypeScript development.

### Type-check

```bash
bunx tsc --noEmit
```

## Building release artifacts

The repository includes EAS profiles for the two CI release channels. Local builds require the platform's native toolchain and configured signing credentials:

```bash
# Android APK
bunx eas-cli build --local --platform android --profile release

# iOS IPA (run on macOS)
bunx eas-cli build --local --platform ios --profile release
```

The Android profiles are configured to produce installable `.apk` files. The GitHub Actions workflow in `.github/workflows/release.yml` builds iOS on a macOS runner and Android on an Ubuntu runner in parallel. Each platform build is retried at most once if it fails, then the workflow stops without additional retries. Artifacts are attached to the GitHub Release using the `Cooler-<channel>-<version>-<platform>.<extension>` naming convention.

To run the workflow manually, open **Actions → Release → Run workflow** and choose `release` or `nightly`. Nightly builds also run automatically at midnight UTC. CI requires the repository's `EXPO_TOKEN` secret and the EAS project to have its signing credentials configured.

## Contributing

Contributions and bug reports are welcome. For a large change, open an issue first so implementation decisions and scope can be aligned before work begins.

1. Fork the repository and create a focused branch.
2. Keep each pull request limited to one feature or fix.
3. Follow the existing code style and project structure.
4. Run the relevant checks before submitting.
5. Explain what changed, why it changed, and how it was tested.
6. Include screenshots or recordings for visible UI changes.

Bug reports should include the platform, app version or commit, Coolify version, reproduction steps, expected behavior, and relevant sanitized logs.

Never include Coolify API tokens, instance credentials, private URLs, or other secrets in issues, logs, screenshots, commits, or pull requests.

## Disclaimer

Cooler is an independent project. It is not affiliated with, endorsed by, or sponsored by Coolify.
