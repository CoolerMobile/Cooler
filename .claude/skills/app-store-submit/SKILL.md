---
name: app-store-submit
description: Release Cooler to the App Store with Expo/EAS — bump the version, build (remote EAS or local), and submit to TestFlight via the repo's `bun release` flow and `eas build`/`eas submit`. Covers what EAS does and the two things it does not (screenshots, App Store review submission).
user-invocable: true
---

# App Store release & submission (Expo / EAS)

This project ships with **Expo / EAS** (eas-cli, credentials already configured for danfq). The canonical entry point is the repo's **`bun release`** script (`scripts/release.ts`), which bumps the version everywhere, builds with EAS, tags + creates a GitHub release, and submits iOS to TestFlight. Prefer it over hand-running commands.

> EAS account/config facts (from `eas.json`): submit profile `production` targets **`ascAppId: 6821412351`**; `appVersionSource: remote` with `autoIncrement` on the `production` profile. Build profiles: `development`, `preview`, `production`, `release` (Android apk), `nightly`.

## What EAS covers — and what it doesn't

| Step | Tool |
| --- | --- |
| Version bump (app.json, package.json, iOS/Android native) | `bun release` |
| Build IPA (remote on EAS servers, or `--local`) | `eas build` |
| Upload binary → App Store Connect → **TestFlight** | `eas submit` |
| iOS signing credentials | `eas credentials` (already set up) |
| Store listing **text** + **What's New** | `eas metadata:push` (via `store.config.json`, set up — see "Metadata") |
| App Store **screenshots** | ❌ **EAS can't** — see "Gaps" |
| **Submit for App Store review** (promote a build past TestFlight) | ❌ **EAS can't** — see "Gaps" |

So EAS gets a build to **TestFlight** and manages text metadata, but the final **App Store review submission** and **screenshots** are not part of EAS.

## Safety

- `eas submit` and `bun release --submit` are **outward-facing** (they push git, create a GitHub release, and upload a binary to Apple). Get an explicit go-ahead for *this* release before running them. A build alone (`eas build`) is safe/reversible; submission is not.
- Confirm flags with `eas <cmd> --help`; prefer `--non-interactive` in automation.

## Preflight

```bash
export PATH="$HOME/.bun/bin:$PATH"
eas whoami                      # expect: danfq
eas build:list --platform ios --limit 5   # recent builds + their status
```
Confirm the working tree is clean for version files (the release script refuses to run if `package.json`, `app.json`, the native version files have uncommitted changes), and you're on the intended branch (it pushes to `origin/<branch>`).

## Primary path — `bun release`

`bun release [options] [patch|minor|major|x.y.z]` (omit the version to auto-bump from conventional commits).

### Convenience scripts (package.json)

The common iOS flows are aliased so you do not have to remember the flags. `:store` means "also push the App Store listing + What's New" (reviewed first); `:eas` means "build remotely in CI". A version can still be appended, e.g. `bun run release:store 1.3.3`.

| Script | Expands to | What it does |
| --- | --- | --- |
| `bun run release:ios` | `--ios --submit` | Local build → TestFlight |
| `bun run release:store` | `--ios --submit --push-metadata` | Local build → TestFlight, then push listing + What's New (review first) |
| `bun run release:eas` | `--eas --ios --submit` | Remote CI build → TestFlight |
| `bun run release:eas:store` | `--eas --ios --submit --push-metadata` | Review What's New locally, then CI build → TestFlight → push metadata |
| `bun run release:nightly` | `--ios --nightly` | Internal nightly (never submitted) |
| `bun run release:bump` | `--bump-only` | Just compute/write the next version |

Use bare `bun release …` with raw flags for anything else (Android, both platforms, explicit combos).

```bash
# iOS release, build locally, then submit to TestFlight:
bun release --ios --submit

# same, plus push the live App Store listing + What's New (reviewed first):
bun release --ios --submit --push-metadata

# iOS release built remotely by dispatching the EAS GitHub workflow (release.yml):
bun release --eas --ios --submit

# remote, and also push store metadata in CI (uses the committed store.config.json):
bun release --eas --ios --submit --push-metadata

# both platforms, explicit version:
bun release --android --ios --submit 1.3.3

# internal nightly (never submitted):
bun release --ios --nightly

# just compute/write the next version (no build):
bun release --bump-only
```

Notes from `scripts/release.ts`:
- iOS release → EAS **`production`** profile; nightly → **`nightly`** profile.
- `--eas` dispatches `.github/workflows/release.yml` (remote CI build) instead of building on this machine; without it the script builds with `eas build --local`. The remote workflow mirrors the full flow: **prepare** (bump + commit + push), **build** (EAS cloud), **submit** (TestFlight), **metadata** (push store listing + What's New — only when dispatched with `--push-metadata`), and **release** (GitHub release). `--eas … --push-metadata` forwards `push_metadata=true` to the workflow.
- On submit it runs `eas submit --platform ios --path <artifact> --profile production --non-interactive`, i.e. straight to **TestFlight**.
- It creates a git tag `vX.Y.Z` and a GitHub release with generated notes.
- **The What's New review runs on your machine for both paths.** `--eas … --push-metadata` shows the notes and waits for `y/N` locally, commits the approved `store.config.json`, then dispatches; CI's `metadata` job pushes that committed file (no CI prompt). So you always see and approve the copy before it goes live, whether the build is local or remote.
- **Store metadata pushes only on demand.** A plain `--ios --submit` builds and ships to TestFlight but does **not** touch the live App Store listing; it just prints how to push. To also sync the listing + What's New, add **`--push-metadata`**.
- **What's New is wired in (on push), both locally and for `--eas`:** for `--ios --submit --push-metadata`, the script generates (or reuses) the App Store "What's New", **prints it in the terminal, and requires a `y/N` confirmation** before it does anything outward-facing. It reuses `store.config.json` → `releaseNotes` if already set (e.g. notes you polished via this skill), otherwise drafts them from commits with `whats-new.sh`. `WHATS_NEW_YES=1` skips the prompt for non-interactive runs. No em-dashes are ever emitted.
  - **Local** (`--ios --submit --push-metadata`): confirm → build → submit → `eas metadata:push`.
  - **Remote** (`--eas --ios --submit --push-metadata`): the review+confirm happens **on your machine first**; on approval the script commits `store.config.json` and pushes, then dispatches `release.yml` with `push_metadata=true`. The workflow's `metadata` job (after submit) runs `eas metadata:push` on that committed file, so CI publishes exactly the notes you reviewed. No prompt runs in CI.

## Raw EAS equivalents (when not using the script)

Remote build on EAS servers (this is the "remote build" you normally use — omit `--local`):
```bash
eas build --platform ios --profile production
```
Submit the resulting build to TestFlight:
```bash
eas submit --platform ios --profile production --latest            # newest build, or:
eas submit --platform ios --profile production --path ./artifacts/Cooler-….ipa
# add --what-to-test "…" for the TestFlight testers' notes
```

## Metadata + What's New (EAS Metadata)

Store listing text is managed in **`store.config.json`** (bootstrapped from the live listing with `eas metadata:pull`). It holds title, subtitle, description, keywords, promo text, categories, URLs, age ratings, and **`info.<locale>.releaseNotes`** — the App Store "What's New".

Edit the fields, then validate and push:
```bash
eas metadata:lint      # validate locally — safe, no network writes
eas metadata:push      # ⚠️ OUTWARD-FACING: writes the LIVE App Store listing — get go-ahead first
```
`lint` is safe; `push` changes the live listing, so treat it like a submission (confirm first). Screenshots are NOT part of EAS Metadata (see Gaps).

### Auto-generate "What's New" from commits

`bun release --ios --submit` already does this and shows it for confirmation (see above). The steps below are for doing it by hand, or for polishing the copy so the release run reuses it instead of the mechanical draft.

`whats-new.sh` has two modes:
```bash
.claude/skills/app-store-submit/whats-new.sh                 # grouped raw material for an LLM to rewrite
.claude/skills/app-store-submit/whats-new.sh --notes         # cleaned ready-to-use bullets (what bun release uses)
.claude/skills/app-store-submit/whats-new.sh --notes v1.2.5..v1.3.2   # explicit range
```
It keeps `feat`/`fix`/`perf`, flags breaking, and (in `--notes`) drops internal/infra commits (sentry, CI, build tooling, version bumps, deps, lint, etc.).

To hand-author polished notes:
1. Run the grouped mode for the range to see the raw changes.
2. **Rewrite** into concise, benefit-focused copy — lead with user value, group into a short bulleted list, friendly tone, under 4000 characters, and do **not** paste commit subjects verbatim.
3. **No em-dashes or en-dashes** (Dan's rule) — use a colon, comma, or period instead. Applies to all `releaseNotes` and listing copy.
4. Write the result into `store.config.json` → `apple.info.<locale>.releaseNotes` (use `\n` for line breaks). Now `bun release` will reuse it (it only auto-drafts when `releaseNotes` is empty).
5. `eas metadata:lint`, then `eas metadata:push` (outward-facing — get go-ahead) to sync.

(The `asc-whats-new-writer` skill has extra copywriting heuristics if wanted; the flow above keeps everything in EAS.)

## Gaps EAS doesn't handle (finish these to reach the public App Store)

Getting onto TestFlight is not the same as releasing on the App Store. After the build is processed:

1. **Screenshots** — EAS Metadata has no screenshot support. Upload the set produced by the `aso-appstore-screenshots` skill (`./screenshots/final/`, 1290×2796 = iPhone 6.7"):
   - Simplest: upload in **App Store Connect** (Media Manager) by hand, or
   - Automate with `asc screenshots upload --version-localization "LOC_ID" --path ./screenshots/final --device-type IPHONE_67` (the `asc` CLI is installed; see the `asc-shots-pipeline` / `asc-cli-usage` skills), or fastlane `deliver`.
   - `showcase.png` is a preview only — don't upload it.
2. **Submit for App Store review** — EAS stops at TestFlight. Create/select the App Store version and submit it for review in **App Store Connect**, or with the `asc` CLI (`asc review submit --app 6821412351 …`, see the `asc-release-flow` / `asc-submission-health` skills). Remember **Privacy Nutrition Labels** must be set once in ASC.

   (Store listing **text** is no longer a gap — it's managed via EAS Metadata; see the Metadata section above.)

## Monitor

```bash
eas build:list --platform ios --limit 5
eas submit:list --platform ios --limit 5   # submission status
```
After `eas submit`, the build appears in TestFlight once Apple finishes processing (minutes to ~an hour). Report status plainly; don't claim "submitted to the App Store" when it's only on TestFlight.

## Relationship to the asc skills

This repo also has `asc-*` skills (release-flow, submission-health, metadata-sync, shots-pipeline). With the EAS-first workflow, use EAS for build + TestFlight, and reach for `asc` only for the EAS gaps above (screenshots upload, store metadata if you prefer it over EAS Metadata, and the App Store review submission). Don't run both an `eas submit` and an `asc` upload for the same binary.
