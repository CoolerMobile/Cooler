# Cooler

A simple, user-first mobile manager for [Coolify](https://coolify.io).

Cooler aims to make checking and managing self-hosted infrastructure from a phone feel reliable, focused, and native - without replacing the full Coolify dashboard.

> [!IMPORTANT]
> Cooler is currently in early development. The scope and stack below will evolve as the project grows.

## Scope

Cooler is being built around the tasks that are most useful away from a desktop:

- Connect to one or more Coolify instances
- View projects, environments, applications, services, and servers
- Check resource and deployment status at a glance
- Start, stop, restart, and redeploy resources
- Follow deployment and application logs
- Receive useful notifications without losing sessions unexpectedly

The first releases will focus on dependable core management. Broader administration features can follow once that foundation is solid.

## Stack

The project currently uses:

- [React Native](https://reactnative.dev) with [Expo](https://expo.dev)
- [Expo Router](https://docs.expo.dev/router/introduction) for file-based navigation
- [TypeScript](https://www.typescriptlang.org)
- [Expo Development Builds](https://docs.expo.dev/develop/development-builds/introduction)
- [Expo UI](https://docs.expo.dev/versions/latest/sdk/ui/) for native platform components
- [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/)
- [Bun](https://bun.sh) for package management and scripts

This list intentionally reflects the stack already in the repository. New entries will be added as architectural decisions are made.

## Getting started

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

The project includes `expo-dev-client`. Create and install a development build before opening it for the first time:

```bash
bunx expo run:android
# or
bunx expo run:ios
```

After the native build is installed, `bun run dev` is enough for regular JavaScript and TypeScript development.

### Lint

```bash
bun run lint
```

## Contributing

Cooler is at an early stage, so opening an issue before starting a large change is strongly encouraged. It helps avoid duplicated work and keeps implementation decisions aligned with the project's scope.

For contributions:

1. Fork the repository and create a focused branch.
2. Keep each pull request limited to one feature or fix.
3. Follow the existing code style and project structure.
4. Run `bun run lint` before submitting.
5. Explain what changed, why it changed, and how it was tested.
6. Include screenshots or recordings for visible UI changes.

Bug reports should include the platform, app version or commit, Coolify version, reproduction steps, expected behavior, and any relevant sanitized logs.

Never include Coolify API tokens, instance credentials, private URLs, or other secrets in issues, logs, screenshots, commits, or pull requests.

## Project status

Cooler is not ready for production use yet. APIs, storage decisions, navigation, and supported Coolify versions may change while the initial architecture is established.

## Disclaimer

Cooler is an independent project. It is not affiliated with, endorsed by, or sponsored by Coolify.
