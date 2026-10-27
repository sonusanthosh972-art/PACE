# Changelog

## Backend consolidation: Node.js API + live admin (2026-10-27)

### Removed
- `apps/api` (.NET 10). `apps/api-node` is now the only backend (DECISIONS D29).

### Fixed
- Sync contract: `POST /api/v1/transactions/sync` returned `total`, but the app expects `totalProcessed`, so every sync failed in the app.
- Admin endpoints were open to anyone on the network; they now require `x-admin-key` and are disabled without `ADMIN_API_KEY`.
- CORS was fully open by default; it is now off unless `CORS_ORIGINS` lists origins.
- Async route errors could crash the process (Express 4); upgraded to Express 5 with a problem-details error handler.
- Insights and the nightly job used the server machine's timezone; they now use IST with the same rules as the app (refunds net off, fixed and excluded payments ignored).
- Default database was `kailvarn`; it is `paisapulse` again.
- Refresh-token rotation is atomic, so a replayed token is rejected; JWTs are pinned to HS256.
- Sync input is validated against the app's schema (categories, modes, 64-hex dedupe hash, no unknown fields such as raw SMS text); `_id`/`userId` are no longer returned.
- Admin stats are real (active users, average daily budget, DB latency, rate-limit hits) instead of hardcoded numbers.

### Added
- api-node test suite (15 tests, embedded MongoDB): auth, refresh rotation, user isolation, sync contract, profile, delete account, insights, nightly job, admin key.
- Admin API: `/api/v1/admin/fixed-expenses` and `/api/v1/admin/summaries`.
- Admin dashboard loads live users, transactions, fixed expenses, daily summaries, stats and health, with a banner when the API is unreachable.
- `scripts/check.sh` runs api-node typecheck/tests/build and admin typecheck/lint instead of dotnet.

## Phase 7: Backend API (.NET 10 + MongoDB) (2026-10-26)

### Added
- Database (MongoDB `paisapulse`): 5 collections (`users`, `fixedExpenses`, `transactions`, `userRules`, `dailySummaries`).
- Automatic index setup on server startup, including unique compound index on `(userId, dedupeHash)` for zero duplicate transactions, unique email on `users`, and unique `(userId, dateKey)` on `dailySummaries`.
- Accounts & Auth: BCrypt password hashing, JWT bearer access token generation, cryptographically secure 30-day refresh token rotation, `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`.
- Profile & Fixed Expenses: `GET/PUT /api/v1/me/profile`, `GET/PUT /api/v1/me/fixed-expenses`.
- Transaction Sync & Management: `POST /api/v1/transactions/sync` (idempotent atomic upserts), `GET /api/v1/transactions` (date/category filtering, pagination), `PATCH /api/v1/transactions/{id}` (category, excluded flag, note).
- Insights: `GET /api/v1/insights/cycle` (spend total, category breakdown, small leaks, top merchants, essential split, cycle progress), `GET /api/v1/insights/daily`.
- Account Deletion: `DELETE /api/v1/me` cascading removal of user account and all associated collections.
- Health Check: `GET /health` and `GET /api/v1/health` with live MongoDB ping.
- Safety & Security:
  - Strict user-scoping on every repository query and endpoint.
  - FluentValidation on every request body with RFC 7807 problem-details error formatting.
  - Rate limiting (dedicated auth endpoint limiter and general API limiter).
  - Production HTTPS enforcement with development HTTP support for local device testing.
  - Sensitive credential masking in logs, exceptions, and `ToString()`.
- Nightly Job (Hangfire): Scheduled at midnight IST to aggregate and store each user's `dailySummaries`.
- Dockerless real MongoDB integration tests using `Mongo2Go` (v5.0.0) with 33 passing test cases covering auth, sync idempotency, cross-user isolation, validation errors, daily summary calculation, and health checks.

### Fixed
- Hardcoded fallback JWT secret removed: server fails fast at startup if `JWT_SECRET` is missing or under 32 characters.
- Refresh tokens stored as SHA256 hashes in MongoDB rather than plain text.
- Health check sanitization: prevents leaking raw database exception messages or cluster hostnames.
- CORS locked down: disabled by default; only explicit origins allowed.
- Index setup enforcement: startup fails fast with an abort rather than running degraded if index setup fails.
- Sync immutable `_id` bug: switched from `ReplaceOneAsync` to `UpdateOneAsync` with `SetOnInsert` for immutable identifiers so re-syncing payments with different client IDs updates cleanly without MongoDB error.

## Phase 5: Screens, design system, animations (2026-10-24)

### Added
- Design tokens (`src/theme/tokens.ts`): the specified dark/light palettes, spacing, radii, Inter type scale
  (hero 52pt, body 16pt, line height 1.5), motion constants. ThemeProvider: system theme by default, manual
  override, Reduce Motion flag. Contrast is enforced by tests (≥ 4.5:1 for every text token on every surface).
- Components: AppText (tabular numbers, font scaling), Screen, Card + PressableScale (0.97 spring press),
  Button (haptics, ≥ 48dp), Amount (number roll-up), BudgetRing (Skia + Reanimated, 600 ms spring from 0,
  eases on new transactions), TransactionRow (full spoken description), Chip, MoneyField (returns paise),
  TextField, CategoryGrid, DayPicker, Segmented, ListRow/SwitchRow, StepHeader, FixedExpensesEditor,
  BudgetPreview, Donut and DailyBars charts (Skia), Loading/Empty/Error states.
- Screens (Expo Router): onboarding (welcome, salary + payday, fixed expenses, savings goal, permissions hub,
  one explainer screen per permission before the system prompt); tabs Today, Insights, Transactions, Settings;
  quick-add sheet; transaction sheet (re-categorise → rule, "Not an expense", delete manual entry); settings for
  salary/savings, fixed expenses, notification times, theme, data sources, CSV export, and an in-app
  "Delete all my data" confirmation (type DELETE).
- Transactions: search, range/mode/category filters, FlashList grouped by day, swipe actions
  (Category / Not an expense) with equivalent screen-reader actions.
- Today: ring + rolling "left today", status line with icon + text, spent today / left this cycle, yesterday line,
  on-budget streak, "needs a category" nudge, today's list where new rows slide in (fade with Reduce Motion),
  light haptic on new transactions, pull to refresh, import progress note.
- Sample data mode ("Explore with sample data" on the welcome screen) so the UI can be tried without SMS.
- Device sync: first-run 90-day import after onboarding, live SMS events, refresh on resume (rolls the day over).
- Tests: palette contrast, formatting/CSV, today helpers, components, delete-data flow (216 mobile tests total).

### Fixes during the self-check loop
1. Light-theme button text on the spec green (#3E8E6B) was 3.8:1 → added `accentFill` (#2F7356) for button fills.
2. `StyleSheet.absoluteFillObject` no longer exists in RN 0.86 → explicit absolute style.
3. React Compiler lint: `Date.now()` during render (3 screens) → `useTodayKey()` hook; ref read during render
   (Today list) → lazy state; closure reassignment in the donut → plain loop; synchronous setState in an
   effect (`useCountUp`) → derive the value when not animating.
4. Reanimated 4 in Jest (`loadUnpackers` undefined) → `react-native-worklets/jest/resolver.js` + `setUpTests()`.
5. Verified Metro can bundle the whole app (`expo export --platform android`, 2,339 modules).

## Phase 4: Kotlin SMS + notification module (2026-10-24)

### Added
- `apps/mobile/modules/sms-reader`: local Expo module (Kotlin, Android only).
  - `BankSenders`: native allow-list of bank sender IDs and payment-app packages. Anything else is
    dropped before its body is read; nothing non-bank is stored, queued or passed to JS.
  - `BankSmsReceiver` (RECEIVE_SMS, live; joins multipart SMS), `PaymentNotificationListener`
    (GPay, PhonePe, Paytm, bank apps), `PendingStore` (bounded app-private queue),
    `IngestDispatcher` (live event if JS is running, else `IngestHeadlessService` headless JS task;
    items stay queued if Android refuses a background start).
  - JS API (`modules/sms-reader/index.ts`): permissions, `readBankSms(since)` (90-day import),
    `drainPending`, notification-access check/settings, app settings. Every native payload is zod-validated;
    module is optional (null on iOS/Jest/Expo Go).
  - JUnit tests for the sender/package allow-lists.
- `src/services/ingest.ts`: parse → dedupe → store pipeline, 90-day import, pending drain; raw text is never persisted.
- `src/services/headless.ts` + custom `index.ts` entry registering the `PaisaPulseIngest` headless task.
- `src/data/appDb.ts`: expo-sqlite adapter (WAL, migrations on open).

### Fixes during the self-check loop
1. **check.sh ran `nvm use` in a subshell**, so JS checks silently used the machine's default Node 20.
   Surfaced when `node:sqlite` (Node 22+) was missing. Fixed; the script now aborts unless Node matches `.nvmrc`.
   Earlier phases' JS checks were re-run on Node 24 as part of this run.
2. `import/no-unresolved` did not know the `node:sqlite` builtin → declared it in `import/core-modules`
   for the test helper only (the rule stays on).
3. An earlier "lint OK" was masked by a `| tail` pipe; checks now read real exit codes.
4. `expo` does not re-export `EventSubscription` → listener handle typed structurally.
5. Used an `eslint-disable` comment in the entry file → removed; restructured into a side-effect import.
6. One transient `:app:packageDebug` failure (no cause in logs, likely overlap with a concurrent Gradle run);
   passed on the next clean run of the full suite.

## Phase 3: SQLite schema + repositories (2026-10-24)

### Added
- Versioned migrations (`PRAGMA user_version`): transactions (integer paise CHECKs, unique dedupe hash,
  sync state), user_rules, profile, fixed_expenses, daily_budgets (frozen budgets), settings, notification_log.
- Repositories: ingest with exact-hash + ±3 min window dedupe and field merging, manual entry, filters/search
  (LIKE-escaped), re-categorise → automatic user rule (applied to existing and future rows), exclude,
  sync bookkeeping (`markSynced` ignores rows changed after sending), profile + fixed expenses, frozen
  daily budget, streak, zod-validated settings with per-key fallback, once-per-day notification log, wipe.
- Tests run real SQL via Node's built-in `node:sqlite` (`src/data/testing/nodeSqliteDb.ts`).

## Phase 2: Parser, dedupe, categoriser, budget maths (2026-10-24)

### Added
- `src/domain`: money (integer paise, string parsing, en-IN formatting), IST calendar, categories with
  `isEssential`, zod transaction schemas, SMS + notification parser, merchant normalisation, categoriser
  (rules → merchant map → heuristics → Uncategorised), dedupe (sha256 via @noble/hashes), budget maths,
  insights helpers.
- 53 realistic SMS fixtures across HDFC, ICICI, SBI (INB/UPI/ATM/CBS/Card), Axis, Kotak, Paytm, IDFC, YES:
  debit, credit, UPI, card, ATM, NEFT/IMPS, autopay, OTP, promo, failed, reminders, non-bank senders.
- Required budget tests: ₹1,666.67/day, ₹1,579.31 after a ₹4,200 overspend, zero when exhausted.

### Fixes during the self-check loop
1. Merchant names starting with "AC" (ACME) were rejected as "account" → added a word boundary.
2. That exposed "Rs500" being accepted as a merchant → reject currency-prefixed amounts.
3. Jest could not parse ESM-only `@noble/hashes` → added it to `transformIgnorePatterns`.
4. Android build: stale CMake caches in `node_modules/*/android/.cxx` from before Reanimated/Worklets were
   installed made `expo-modules-core` link a missing `libworklets.so` → cleared caches, clean rebuild.
5. Formatting-only lint errors → `prettier --write`.

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
