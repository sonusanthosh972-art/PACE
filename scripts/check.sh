#!/usr/bin/env bash
# Full self-check suite. Usage: scripts/check.sh [--android]
# Exits non-zero on the first failing check.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Toolchain: Node from .nvmrc via nvm.
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  cd "$ROOT" && nvm use >/dev/null
fi
REQUIRED_NODE="v$(tr -d '[:space:]' < "$ROOT/.nvmrc")"
if [ "$(node -v)" != "$REQUIRED_NODE" ]; then
  echo "Node $REQUIRED_NODE required (found $(node -v)). Run: nvm install" >&2
  exit 1
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

step() { printf '\n==> %s\n' "$*"; }

cd "$ROOT/apps/mobile"
step "mobile: tsc --noEmit";  npx tsc --noEmit
step "mobile: expo lint";     npx expo lint
step "mobile: jest";          npx jest --ci
step "mobile: expo-doctor";   npx expo-doctor

cd "$ROOT/apps/api-node"
step "api: typecheck";  npm run typecheck
step "api: tests";      npm test
step "api: build";      npm run build

cd "$ROOT/apps/admin"
step "admin: tsc --noEmit"; npx tsc --noEmit
step "admin: eslint";       npx eslint src

if [ "${1:-}" = "--android" ]; then
  cd "$ROOT/apps/mobile"
  if [ ! -d android ]; then
    step "android: expo prebuild"; CI=1 npx expo prebuild --platform android --no-install
  fi
  step "android: Kotlin unit tests + gradlew assembleDebug"
  (cd android && ./gradlew :sms-reader:testDebugUnitTest assembleDebug --console=plain)
fi

printf '\nAll checks passed.\n'
