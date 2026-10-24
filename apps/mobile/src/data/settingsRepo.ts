import { z } from 'zod';

import type { SqlDb } from './db';

const timeOfDay = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

export type TimeOfDay = z.infer<typeof timeOfDay>;

export const settingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  morningTime: timeOfDay.default({ hour: 8, minute: 0 }),
  nightTime: timeOfDay.default({ hour: 22, minute: 0 }),
  weeklyTime: timeOfDay.default({ hour: 19, minute: 0 }),
  notificationsEnabled: z.boolean().default(true),
  liveAlertsEnabled: z.boolean().default(true),
  onboardingComplete: z.boolean().default(false),
  smsImportDone: z.boolean().default(false),
  demoMode: z.boolean().default(false),
  accountEmail: z.string().email().nullable().default(null),
  lastSyncAt: z.number().int().nullable().default(null),
  apiBaseUrl: z.string().url().nullable().default(null),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/** Reads all settings; unknown or corrupt values fall back to defaults key by key. */
export async function getSettings(db: SqlDb): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings',
    [],
  );
  const raw: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      raw[row.key] = JSON.parse(row.value);
    } catch {
      // Corrupt value: ignore, the default applies.
    }
  }
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(settingsSchema.shape) as SettingKey[]) {
    if (!(key in raw)) continue;
    const field = settingsSchema.shape[key].safeParse(raw[key]);
    if (field.success) result[key] = field.data;
  }
  return settingsSchema.parse(result);
}

export async function setSetting<K extends SettingKey>(
  db: SqlDb,
  key: K,
  value: Settings[K],
): Promise<void> {
  const parsed = settingsSchema.shape[key].parse(value);
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, JSON.stringify(parsed)],
  );
}

/** Records a once-per-key event (e.g. "warn80:2026-10-24"). Returns false if already recorded. */
export async function markOnce(db: SqlDb, key: string, now: number): Promise<boolean> {
  const res = await db.runAsync(
    'INSERT OR IGNORE INTO notification_log (key, sent_at) VALUES (?, ?)',
    [key, now],
  );
  return res.changes > 0;
}

/** Deletes every row of user data on the device ("Delete all my data"). */
export async function wipeAllLocalData(db: SqlDb): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const table of [
      'transactions',
      'user_rules',
      'fixed_expenses',
      'profile',
      'daily_budgets',
      'settings',
      'notification_log',
    ]) {
      await db.runAsync(`DELETE FROM ${table}`, []);
    }
  });
}
