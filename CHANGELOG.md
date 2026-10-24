# Changelog

## Phase 1: Monorepo scaffold (2026-10-24)

### Added
- Git repo with `.gitignore` written first (`.env`, keystores, generated `android/`/`ios/`, build output).
- `.nvmrc` (Node 24.21.0), `.editorconfig`, root `package.json` (convenience scripts only).
- `scripts/check.sh`: the full self-check suite (`--android` adds prebuild + `assembleDebug`).
- `apps/mobile`: Expo SDK 57 / RN 0.86.3 / React 19.2.3, Expo Router (`src/app`), typed routes,
  `expo-dev-client` (development build), `expo-system-ui`, TypeScript strict (+ `noUncheckedIndexedAccess`),
  ESLint flat config (`eslint-config-expo` + Prettier, `no-explicit-any` and `ban-ts-comment` as errors),
  Jest (`jest-expo`) + React Native Testing Library 14, a smoke test.
- `apps/api`: .NET 10 solution (`PaisaPulse.slnx`), minimal API project, xUnit v3 test project,
  central package management, warnings as errors, `latest-recommended` analyzers.
  Startup fails fast with an actionable message if `MONGODB_URI` is missing or malformed; the value is never printed.
  `.env.example`. 13 unit tests (dotenv parser, settings validation, secret masking).
- `DECISIONS.md`, `README.md` (stub).

### Fixes during the self-check loop
1. `expo install --fix` bumped Expo to an SDK 58 patch outside the two-week window → moved to SDK 57 (see D2).
2. SDK 57 patch versions fetched by `expo install` were newer than the cutoff → `expo-doctor` failed with
   patch mismatches → adopted Expo SDK patch exemption (D1) and took the patches it required.
3. npm `ERESOLVE`: `expo-router`'s optional `react-dom` peer resolved to 19.3.0 vs React 19.2.3 → pinned `react-dom@19.2.3`.
4. `expo-doctor` duplicate native module: `expo-symbols` pulled `expo-font@58` → added `expo-font` at its SDK 57 version.
5. Jest "Cannot find module 'expo-modules-core'" (stale nesting after repeated installs) → clean reinstall.
   Also: a `grep` in my check pipeline hid this failure once; checks now read exit codes directly.
6. `test-renderer@1.3.1` was newer than the cutoff → `^1.3.0`.
7. CA1707 (underscores in test names) → renamed tests to PascalCase; no rule disabled.
8. `.NET 10 dotnet test` rejects VSTest → opted in to Microsoft.Testing.Platform in `global.json`.
9. Prebuild warned `userInterfaceStyle` needs `expo-system-ui` → installed it.
