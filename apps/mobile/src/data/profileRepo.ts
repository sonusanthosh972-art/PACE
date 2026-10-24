import { z } from 'zod';

import type { BudgetProfile, FixedExpense } from '@/domain/budget';

import type { SqlDb } from './db';
import type { Clock } from './transactionsRepo';

export const fixedExpenseInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  amountPaise: z.number().int().positive(),
  dueDay: z.number().int().min(1).max(31),
});

export const profileInputSchema = z.object({
  monthlySalaryPaise: z.number().int().nonnegative(),
  payday: z.number().int().min(1).max(31),
  monthlySavingsGoalPaise: z.number().int().nonnegative(),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type FixedExpenseInput = z.infer<typeof fixedExpenseInputSchema>;

export async function getFixedExpenses(db: SqlDb): Promise<FixedExpense[]> {
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    amount_paise: number;
    due_day: number;
  }>('SELECT id, name, amount_paise, due_day FROM fixed_expenses ORDER BY created_at', []);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    amountPaise: r.amount_paise,
    dueDay: r.due_day,
  }));
}

/** Null until onboarding has saved a profile. */
export async function getProfile(db: SqlDb): Promise<BudgetProfile | null> {
  const row = await db.getFirstAsync<{
    salary_paise: number;
    payday: number;
    savings_goal_paise: number;
  }>('SELECT salary_paise, payday, savings_goal_paise FROM profile WHERE id = 1', []);
  if (!row) return null;
  return {
    monthlySalaryPaise: row.salary_paise,
    payday: row.payday,
    monthlySavingsGoalPaise: row.savings_goal_paise,
    fixedExpenses: await getFixedExpenses(db),
  };
}

export async function saveProfile(db: SqlDb, input: ProfileInput, clock: Clock): Promise<void> {
  const p = profileInputSchema.parse(input);
  await db.runAsync(
    `INSERT INTO profile (id, salary_paise, payday, savings_goal_paise, updated_at, sync_state)
     VALUES (1, ?, ?, ?, ?, 'pending')
     ON CONFLICT(id) DO UPDATE SET salary_paise = excluded.salary_paise, payday = excluded.payday,
       savings_goal_paise = excluded.savings_goal_paise, updated_at = excluded.updated_at,
       sync_state = 'pending'`,
    [p.monthlySalaryPaise, p.payday, p.monthlySavingsGoalPaise, clock.now()],
  );
}

/** Replaces the whole list (the editor works on the full list). */
export async function replaceFixedExpenses(
  db: SqlDb,
  items: readonly FixedExpenseInput[],
  clock: Clock,
): Promise<FixedExpense[]> {
  const parsed = items.map((i) => fixedExpenseInputSchema.parse(i));
  const now = clock.now();
  const saved: FixedExpense[] = [];
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM fixed_expenses', []);
    for (const [index, item] of parsed.entries()) {
      const id = clock.newId();
      await db.runAsync(
        'INSERT INTO fixed_expenses (id, name, amount_paise, due_day, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, item.name, item.amountPaise, item.dueDay, now + index],
      );
      saved.push({ id, ...item });
    }
    await db.runAsync(`UPDATE profile SET updated_at = ?, sync_state = 'pending' WHERE id = 1`, [
      now,
    ]);
  });
  return saved;
}

export async function profileNeedsSync(db: SqlDb): Promise<boolean> {
  const row = await db.getFirstAsync<{ sync_state: string }>(
    'SELECT sync_state FROM profile WHERE id = 1',
    [],
  );
  return row?.sync_state === 'pending';
}

export async function markProfileSynced(db: SqlDb): Promise<void> {
  await db.runAsync(`UPDATE profile SET sync_state = 'synced' WHERE id = 1`, []);
}
