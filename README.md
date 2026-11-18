# PACE

Personal spending tracker for India: reads bank SMS on-device, gives you a daily budget.

> Work in progress. Full setup guide lands in Phase 10. See `CHANGELOG.md` and `DECISIONS.md`.

## Layout

```
apps/mobile     Expo (SDK 57, React Native 0.86, New Architecture) + Expo Router, TypeScript strict
apps/api-node   Node.js API: Express 5 + MongoDB, TypeScript strict, nightly job via node-cron
apps/admin      Next.js admin dashboard (reads the API through server-side routes)
scripts/        check.sh — the full self-check suite
```

How they connect:

```
phone app ──HTTP /api/v1/*──▶ api-node ──▶ MongoDB
admin (browser) ──▶ admin server routes ──x-admin-key──▶ api-node /api/v1/admin/*
```

## Prerequisites

- Node 24.21.0 (`nvm use` reads `.nvmrc`)
- A MongoDB connection string (e.g. MongoDB Atlas)
- JDK 17 and the Android SDK (`ANDROID_HOME`) for Android builds

## Setup (once)

```bash
nvm use
npm --prefix apps/mobile install
npm --prefix apps/api-node install
npm --prefix apps/admin install

cp apps/api-node/.env.example apps/api-node/.env    # set MONGODB_URI, JWT_SECRET, ADMIN_API_KEY
cp apps/admin/.env.example apps/admin/.env.local    # same ADMIN_API_KEY as the API
```

Generate secrets with `openssl rand -hex 32`.

## Run

| What | Command | URL |
| --- | --- | --- |
| API | `npm run api` | http://localhost:5080/health |
| Admin | `npm run admin` | http://localhost:3000 |
| App on your phone (first time / after native changes) | `npm run android` | — |
| App bundler (daily) | `npm run mobile` | — |

Point the app at the API in **Settings → Account**: either `http://<your Mac's Wi-Fi IP>:5080`
(`ipconfig getifaddr en0`) or, over USB, run `adb reverse tcp:5080 tcp:5080` and use `http://localhost:5080`.

## Money Assistant (AI)

Insights → **Ask your Money Assistant** answers questions from the user's own numbers. The phone
calls `POST /api/v1/assistant/chat`; the API builds a compact summary of that user's finances
(computed with the app's own budget and Purchase Simulator rules) and asks
[OpenRouter](https://openrouter.ai). It is read-only and needs the user to be signed in.

| Variable (apps/api-node) | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | empty = assistant off | Server-side only; never put it in the app |
| `OPENROUTER_MODEL` | `z-ai/glm-5.3-flash` | Any OpenRouter model id; no app update needed |
| `AI_MAX_OUTPUT_TOKENS` | `700` | Longest answer |
| `AI_TIMEOUT_MS` | `45000` | Give up on a slow answer |
| `AI_PER_MINUTE_LIMIT` | `8` | Questions per user per minute |
| `AI_DAILY_MESSAGE_LIMIT` | `40` | Questions per user per day |
| `AI_DAILY_TOKEN_LIMIT` | `150000` | Tokens per user per day |

Chats are stored only on the phone; the server keeps a per-day usage count (no message text).
See DECISIONS.md D34.

## Checks

```bash
npm run check            # mobile tsc/lint/jest/expo-doctor, api typecheck/tests/build, admin tsc/lint
npm run check:android    # ...plus expo prebuild + gradlew assembleDebug
```
