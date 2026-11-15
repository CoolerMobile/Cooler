# Cooler task recipes. Run `just` (no args) to see this list.
#
# Most recipes take an optional version at the end, e.g.
#   just release patch        -> auto-bump to next patch
#   just release-store 1.3.3  -> explicit version

# Show every recipe with its description
default:
    @just --list --unsorted

# ───────────────────────── Releasing (iOS → TestFlight) ─────────────────────────

# Build locally, submit to TestFlight. The everyday release.
release *args:
    bun run release:ios {{args}}

# Local release + push the App Store listing & What's New (you review it first).
release-store *args:
    bun run release:store {{args}}

# Build remotely in CI (EAS GitHub workflow), submit to TestFlight.
release-ci *args:
    bun run release:eas {{args}}

# CI release + metadata push. Review the What's New locally before it dispatches.
release-ci-store *args:
    bun run release:eas:store {{args}}

# Internal nightly build (never submitted to a store).
nightly *args:
    bun run release:nightly {{args}}

# Just compute and write the next version, no build.
bump *args:
    bun run release:bump {{args}}

# ─────────────────────────────── Everyday dev ───────────────────────────────

# Start the Expo dev server (cleared cache, Expo Go).
dev:
    bun run dev

# Build and run the dev client on a connected device.
dev-device:
    bun run dev:native-build

# Run the test suite.
test *args:
    bun run test {{args}}

# ─────────────────────────────── Maintenance ───────────────────────────────

# Remove everything generated: JS deps, Expo/Metro caches, native projects, Xcode build data.
clean:
    rm -rf node_modules .expo ios android
    rm -rf "${TMPDIR:-/tmp}"/metro-* "${TMPDIR:-/tmp}"/haste-map-*
    rm -rf ~/Library/Developer/Xcode/DerivedData/Cooler-*
    @echo "Clean. Run 'just sync' to restore as is, or 'just update' to also update dependencies."

# Install deps, regenerate ios/android from app.json + plugins, repair licenses, install pods.
# Restores everything after `just clean` without bumping any version.
sync:
    bun install
    EXPO_NO_GIT_STATUS=1 bunx expo prebuild --clean --no-install
    bun run fix:licenses
    cd ios && pod install --repo-update
    bunx expo install --check
    @echo "Synced. Review the native diff (git status ios android) before committing."

# Update deps within their ranges, align Expo SDK packages, then sync native projects and pods.
update:
    bun update
    bunx expo install --fix
    just sync
