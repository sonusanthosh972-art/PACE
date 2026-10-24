# Changelog

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
