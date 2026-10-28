/**
 * The subset of expo-sqlite's SQLiteDatabase the repositories use. Keeping repositories
 * on this interface lets unit tests run them against node:sqlite.
 */
export type SqlValue = string | number | null;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlDb {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<RunResult>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export const DATABASE_NAME = 'paisapulse.db';

/** Ordered migrations; index + 1 is the schema version stored in PRAGMA user_version. */
export const MIGRATIONS: readonly string[] = [
  /* v1 */ `
  CREATE TABLE transactions (
    id             TEXT PRIMARY KEY NOT NULL,
    amount_paise   INTEGER NOT NULL CHECK (amount_paise > 0),
    direction      TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
    account_last4  TEXT,
    merchant       TEXT,
    merchant_norm  TEXT NOT NULL DEFAULT '',
    vpa            TEXT,
    mode           TEXT NOT NULL,
    upi_ref        TEXT,
    balance_paise  INTEGER,
    category       TEXT NOT NULL,
    needs_review   INTEGER NOT NULL DEFAULT 0,
    note           TEXT,
    source         TEXT NOT NULL CHECK (source IN ('sms', 'notification', 'manual')),
    occurred_at    INTEGER NOT NULL,
    dedupe_hash    TEXT NOT NULL UNIQUE,
    is_excluded    INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    sync_state     TEXT NOT NULL DEFAULT 'pending' CHECK (sync_state IN ('pending', 'synced'))
  );
  CREATE INDEX idx_tx_occurred ON transactions (occurred_at DESC);
  CREATE INDEX idx_tx_amount_time ON transactions (amount_paise, occurred_at);
  CREATE INDEX idx_tx_merchant ON transactions (merchant_norm);
  CREATE INDEX idx_tx_sync ON transactions (sync_state);

  CREATE TABLE user_rules (
    id          TEXT PRIMARY KEY NOT NULL,
    pattern     TEXT NOT NULL UNIQUE,
    category    TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE profile (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    salary_paise        INTEGER NOT NULL CHECK (salary_paise >= 0),
    payday              INTEGER NOT NULL CHECK (payday BETWEEN 1 AND 31),
    savings_goal_paise  INTEGER NOT NULL CHECK (savings_goal_paise >= 0),
    updated_at          INTEGER NOT NULL,
    sync_state          TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE fixed_expenses (
    id            TEXT PRIMARY KEY NOT NULL,
    name          TEXT NOT NULL,
    amount_paise  INTEGER NOT NULL CHECK (amount_paise > 0),
    due_day       INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE daily_budgets (
    date          TEXT PRIMARY KEY NOT NULL,
    budget_paise  INTEGER NOT NULL CHECK (budget_paise >= 0),
    computed_at   INTEGER NOT NULL
  );

  CREATE TABLE settings (
    key    TEXT PRIMARY KEY NOT NULL,
    value  TEXT NOT NULL
  );

  CREATE TABLE notification_log (
    key      TEXT PRIMARY KEY NOT NULL,
    sent_at  INTEGER NOT NULL
  );
  `,
  /* v2: day the budget was set up, so a cycle joined part-way is prorated. Existing profiles use
     the day they were last saved, and today's frozen budget is recomputed with the new rule. */ `
  ALTER TABLE profile ADD COLUMN budget_start TEXT;
  UPDATE profile SET budget_start = date(updated_at / 1000, 'unixepoch', '+330 minutes');
  DELETE FROM daily_budgets WHERE date >= date('now', '+330 minutes');
  `,
  /* v3: payments the user deleted. Kept so the delete reaches the server, and so a restore or a
     late duplicate SMS/notification never brings the payment back. */ `
  CREATE TABLE deleted_transactions (
    dedupe_hash  TEXT PRIMARY KEY NOT NULL,
    deleted_at   INTEGER NOT NULL,
    sync_state   TEXT NOT NULL DEFAULT 'pending' CHECK (sync_state IN ('pending', 'synced'))
  );
  `,
];

export async function migrate(db: SqlDb): Promise<number> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    if (sql === undefined) break;
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
  return version;
}
