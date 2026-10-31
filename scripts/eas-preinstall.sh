#!/usr/bin/env bash
set -euo pipefail

# Local checkout should already be unlocked.
if [[ "${EAS_BUILD_RUNNER:-}" != "eas-build" ]]; then
  echo "Local build detected; skipping git-crypt unlock."
  exit 0
fi

if ! command -v git-crypt >/dev/null 2>&1; then
  echo "Installing git-crypt..."

  if [[ "${EAS_BUILD_PLATFORM:-}" == "ios" ]]; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew install git-crypt
  else
    sudo apt-get update
    sudo apt-get install -y git-crypt
  fi
fi

if [[ -z "${GIT_CRYPT_KEY:-}" ]]; then
  echo "GIT_CRYPT_KEY is unavailable."
  exit 1
fi

git-crypt unlock "$GIT_CRYPT_KEY"

echo "Repository secrets decrypted."
