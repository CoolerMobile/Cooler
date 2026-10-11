<div align="center">
  <img src="assets/expo.icon/Assets/logo.svg" alt="Cooler logo" width="180" style="border-radius: 24px;" />
  <h1>Cooler</h1>
  <p>Cooler is a native mobile companion for <a href="https://coolify.io">Coolify</a>. It gives you a focused way to check infrastructure health and manage deployments from your phone without needing the full Coolify dashboard.</p>
</div>

> [!NOTE]
> Cooler is prod-ready. The project is still evolving, and new features will continue to build on the core management experience.

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

The latest Android release is available from the [GitHub Releases](https://github.com/CoolerMobile/Cooler/releases) page:

- `Cooler-<channel>-<version>-android.apk`

The iOS app will be available on the App Store soon. Nightly builds are created explicitly for testing the latest changes; stable releases are also created manually by project maintainers.

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

Stable releases build locally by default. This bumps and commits the version, builds the Android artifact with the local native toolchain, pushes the release commit, and publishes the GitHub Release:

```bash
bun release
# Optional override: patch, minor, major, or an exact x.y.z version
bun release minor
```

Use EAS cloud builds when the local toolchains are unavailable or unwanted:

```bash
bun release --eas
bun release --eas minor
```

Nightly releases are explicit and follow the same local/EAS and version-bump rules:

```bash
bun release --nightly
bun release --nightly --eas
# Version overrides can be combined with either form
bun release --nightly --eas patch
```

With `--eas`, the local command only pushes the selected branch and dispatches `.github/workflows/release.yml`. The workflow bumps and commits the version, queues an Android EAS build, downloads its artifact, and publishes the GitHub Release. Nightly releases are prereleases and are never scheduled automatically.

The Android build is retried at most once if it fails. Release profiles produce installable `.apk` files named `Cooler-<channel>-<version>-android.apk`. Cloud builds require the repository's `EXPO_TOKEN` secret and EAS signing credentials; local builds require locally configured signing credentials.

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
