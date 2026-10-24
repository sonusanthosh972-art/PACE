#!/usr/bin/env bash
# Full self-check suite. Usage: scripts/check.sh [--android]
# Exits non-zero on the first failing check.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Toolchain: Node from .nvmrc via nvm, .NET from ~/.dotnet if not already on PATH.
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  (cd "$ROOT" && nvm use >/dev/null)
fi
if [ -x "$HOME/.dotnet/dotnet" ]; then
  export DOTNET_ROOT="$HOME/.dotnet" PATH="$HOME/.dotnet:$PATH"
fi
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

step() { printf '\n==> %s\n' "$*"; }

cd "$ROOT/apps/mobile"
step "mobile: tsc --noEmit";  npx tsc --noEmit
step "mobile: expo lint";     npx expo lint
step "mobile: jest";          npx jest --ci
step "mobile: expo-doctor";   npx expo-doctor

cd "$ROOT/apps/api"
step "api: dotnet build -warnaserror"; dotnet build -warnaserror --nologo
step "api: dotnet test";               dotnet test --no-build

if [ "${1:-}" = "--android" ]; then
  cd "$ROOT/apps/mobile"
  if [ ! -d android ]; then
    step "android: expo prebuild"; CI=1 npx expo prebuild --platform android --no-install
  fi
  step "android: gradlew assembleDebug"
  (cd android && ./gradlew assembleDebug --console=plain)
fi

printf '\nAll checks passed.\n'
