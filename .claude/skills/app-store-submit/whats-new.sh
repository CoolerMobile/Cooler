#!/usr/bin/env bash
#
# whats-new.sh: collect user-facing changes since the last release for an
# App Store "What's New" (release notes).
#
# Two modes:
#   (default)  grouped raw material (Breaking/Features/Fixes/Performance) for an
#              LLM to rewrite into polished copy (used by the submit skill).
#   --notes    a cleaned, ready-to-use bullet draft (prefixes stripped, internal
#              commits filtered out, dashes normalized) that `bun release` writes
#              into store.config.json for you to review before proceeding.
#
# No em-dashes or en-dashes are ever emitted (Dan's rule); they are replaced
# with ": " or "-".
#
# USAGE:
#   whats-new.sh [--notes] [<git-range>]
#   whats-new.sh                     # grouped, <latest vX.Y.Z tag>..HEAD
#   whats-new.sh --notes             # clean bullets, <latest vX.Y.Z tag>..HEAD
#   whats-new.sh --notes v1.2.5..v1.3.2

set -euo pipefail

NOTES=0
if [[ "${1:-}" == "--notes" ]]; then NOTES=1; shift; fi

RANGE="${1:-}"
if [[ -z "$RANGE" ]]; then
  LAST_TAG="$(git tag --list 'v[0-9]*' --sort=-creatordate | head -1 || true)"
  if [[ -n "$LAST_TAG" ]]; then RANGE="${LAST_TAG}..HEAD"; else RANGE="HEAD"; fi
fi
echo "whats-new range: $RANGE" >&2

subjects="$(git log "$RANGE" --no-merges --format='%s' || true)"

# Normalize any em/en dash in emitted text to ": " (spaced). The bracket class
# below must contain the dash characters themselves; that is the strip pattern.
nodash() { sed -E 's/[[:space:]]*[—–][[:space:]]*/: /g'; }

breaking="$(printf '%s\n' "$subjects" \
  | grep -E '^[a-z]+(\([^)]*\))?!:' \
  | sed -E 's/^[a-z]+(\([^)]*\))?!:[[:space:]]*/- /' | nodash || true)"

pick() { # $1 = type
  printf '%s\n' "$subjects" \
    | grep -E "^$1(\([^)]*\))?:" \
    | sed -E "s/^$1(\([^)]*\))?:[[:space:]]*/- /" | nodash || true
}

feats="$(pick feat)"
fixes="$(pick fix)"
perfs="$(pick perf)"

# ── --notes: cleaned, review-ready bullet draft ────────────────────────
if [[ "$NOTES" -eq 1 ]]; then
  # Internal / infra changes users don't care about: drop from release notes.
  internal='sentry|metro|git-crypt|git crypt|\beas\b|\bci\b|\bcd\b|workflow|pipeline|bump|rollover|dependabot|\bdeps?\b|dependenc|lockfile|lint|format|tsconfig|eslint|prettier|codegen|license'
  bullets="$(printf '%s\n%s\n%s\n%s\n' "$breaking" "$feats" "$fixes" "$perfs" \
    | sed '/^$/d' \
    | sed -E 's/^- //' \
    | grep -viE "$internal" \
    | awk '{ $0 = toupper(substr($0,1,1)) substr($0,2); print "• " $0 }' || true)"
  if [[ -z "$bullets" ]]; then
    echo "• Stability and performance improvements."
  else
    printf '%s\n' "$bullets"
  fi
  exit 0
fi

# ── default: grouped raw material ──────────────────────────────────────
if [[ -z "$breaking$feats$fixes$perfs" ]]; then
  echo "(no user-facing feat/fix/perf commits in range; fall back to a generic 'stability and performance improvements' note or widen the range)"
else
  [[ -n "$breaking" ]] && printf 'BREAKING\n%s\n\n' "$breaking"
  [[ -n "$feats"    ]] && printf 'Features\n%s\n\n' "$feats"
  [[ -n "$fixes"    ]] && printf 'Fixes\n%s\n\n' "$fixes"
  [[ -n "$perfs"    ]] && printf 'Performance\n%s\n\n' "$perfs"
fi

exit 0
