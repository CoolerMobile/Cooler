set dotenv-load

artifact_dir := "artifacts"
version := `bun -e 'console.log(require("./package.json").version)'`

# Show the available development commands.
default:
    @just --list

# Install dependencies from the lockfile.
install:
    bun install --frozen-lockfile

# Start the Expo development server.
dev:
    bun run dev

# Type-check the app without emitting files.
check:
    bunx tsc --noEmit

# Build an installable Android APK locally without creating a release.
build-android profile="release":
    mkdir -p "{{ artifact_dir }}"
    bunx eas-cli@latest build --local --platform android --profile "{{ profile }}" --non-interactive --output "{{ artifact_dir }}/Cooler-local-{{ version }}-android.apk"

# Build an installable iOS IPA locally without creating or submitting a release.
build-ios profile="production":
    mkdir -p "{{ artifact_dir }}"
    bunx eas-cli@latest build --local --platform ios --profile "{{ profile }}" --non-interactive --output "{{ artifact_dir }}/Cooler-local-{{ version }}-ios.ipa"

# Build local artifacts for both platforms (requires macOS for the iOS build).
build-all: build-android build-ios
