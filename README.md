# Paisa Pulse

Personal spending tracker for India: reads bank SMS on-device, gives you a daily budget.

> Work in progress. Full setup guide lands in Phase 10. See `CHANGELOG.md` and `DECISIONS.md`.

## Layout

```
apps/mobile   Expo (SDK 57, React Native 0.86, New Architecture) + Expo Router, TypeScript strict
apps/api      ASP.NET Core minimal API on .NET 10 + MongoDB
scripts/      check.sh — the full self-check suite
```

## Prerequisites

- Node 24.21.0 (`nvm use` reads `.nvmrc`)
- .NET SDK 10.0.401 (pinned in `apps/api/global.json`)
- JDK 17 and the Android SDK (`ANDROID_HOME`) for Android builds

## Quick start

```bash
cd apps/mobile && npm install
cp apps/api/.env.example apps/api/.env   # then set MONGODB_URI
npm run check            # typecheck, lint, tests, expo-doctor, dotnet build + test
npm run check:android    # ...plus expo prebuild + gradlew assembleDebug
```
