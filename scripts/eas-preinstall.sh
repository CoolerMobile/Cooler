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

# EAS clones the repo with git-crypt still locked. Because the git-crypt
# filters cannot run without the key, the encrypted files show up as modified
# and make `git-crypt unlock` abort with "Working directory not clean".
# Neutralize the filters, reset the tree to HEAD so git re-stats the files and
# the clean check passes, then let `git-crypt unlock` restore the real filters
# and decrypt.
git config filter.git-crypt.smudge cat
git config filter.git-crypt.clean cat
git config filter.git-crypt.required false
git reset --hard HEAD

git-crypt unlock "$GIT_CRYPT_KEY"

echo "Repository secrets decrypted."
