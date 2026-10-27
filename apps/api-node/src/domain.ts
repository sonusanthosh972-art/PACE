/**
 * Server copy of the mobile budget rules (apps/mobile/src/domain/{time,budget,categories}.ts).
 * Calendar maths is in Asia/Kolkata with a fixed +05:30 offset (India has no DST), so results
 * never depend on the timezone of the machine running the server.
 */
export const IST_OFFSET_MS = 330 * 60 * 1000;
export const DAY_MS = 86_400_000;

export type DateKey = string; // YYYY-MM-DD

export const DIRECTIONS = ['debit', 'credit'] as const;
export const MODES = ['UPI', 'CARD', 'NEFT', 'IMPS', 'ATM', 'AUTOPAY', 'OTHER'] as const;
export const SOURCES = ['sms', 'notification', 'manual'] as const;

export const CATEGORIES = {
  food: { isEssential: false, isFixed: false },
  coffee: { isEssential: false, isFixed: false },
  groceries: { isEssential: true, isFixed: false },
  transport: { isEssential: true, isFixed: false },
  shopping: { isEssential: false, isFixed: false },
  bills: { isEssential: true, isFixed: false },
  subscriptions: { isEssential: false, isFixed: false },
  entertainment: { isEssential: false, isFixed: false },
  health: { isEssential: true, isFixed: false },
  rent_emi: { isEssential: true, isFixed: true },
  transfers: { isEssential: false, isFixed: false },
  cash: { isEssential: false, isFixed: false },
  other: { isEssential: false, isFixed: false },
  uncategorised: { isEssential: false, isFixed: false },
} as const;

export type CategoryId = keyof typeof CATEGORIES;
export const CATEGORY_IDS = Object.keys(CATEGORIES) as [CategoryId, ...CategoryId[]];

function categoryInfo(category: string) {
  return CATEGORIES[category as CategoryId] ?? CATEGORIES.uncategorised;
}

export function isEssential(category: string): boolean {
  return categoryInfo(category).isEssential;
}

export interface SpendLike {
  amountPaise: number;
  direction: string;
  category: string;
  isExcluded: boolean;
}

/** Non-excluded debits that are not fixed-expense payments. */
export function countsAsSpend(tx: SpendLike): boolean {
  return tx.direction === 'debit' && !tx.isExcluded && !categoryInfo(tx.category).isFixed;
}

/** Refund/reversal credits that net against spending. */
export function countsAsRefund(tx: SpendLike): boolean {
  return (
    tx.direction === 'credit' &&
    !tx.isExcluded &&
    tx.category !== 'other' &&
    tx.category !== 'transfers' &&
    !categoryInfo(tx.category).isFixed
  );
}

/** Σ spend − Σ refunds, floored at zero. */
export function netSpend(txs: readonly SpendLike[]): number {
  let debits = 0;
  let refunds = 0;
  for (const t of txs) {
    if (countsAsSpend(t)) debits += t.amountPaise;
    else if (countsAsRefund(t)) refunds += t.amountPaise;
  }
  return Math.max(0, debits - refunds);
}

export function formatYmd(year: number, month: number, day: number): DateKey {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

export function toDateKey(epochMs: number): DateKey {
  const d = new Date(epochMs + IST_OFFSET_MS);
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Epoch ms of 00:00 IST on the given date. */
export function startOfDayMs(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return Date.UTC(year, month - 1, day) - IST_OFFSET_MS;
}

/** Epoch ms of 23:59:59.999 IST on the given date. */
export function endOfDayMs(key: DateKey): number {
  return startOfDayMs(key) + DAY_MS - 1;
}

export function addDays(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Whole days from a to b (b − a). */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((startOfDayMs(b) - startOfDayMs(a)) / DAY_MS);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Payday clamped to the month length: payday 31 in February → 28th/29th. */
function effectivePayday(year: number, month: number, payday: number): number {
  return Math.min(Math.max(1, Math.trunc(payday)), daysInMonth(year, month));
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export interface Cycle {
  start: DateKey; // payday (inclusive)
  end: DateKey; // day before the next payday (inclusive)
  totalDays: number;
}

/** The salary cycle containing `today`. */
export function cycleFor(today: DateKey, payday: number): Cycle {
  const { year, month, day } = parseDateKey(today);
  const startMonth =
    day >= effectivePayday(year, month, payday) ? { year, month } : shiftMonth(year, month, -1);
  const start = formatYmd(
    startMonth.year,
    startMonth.month,
    effectivePayday(startMonth.year, startMonth.month, payday),
  );
  const next = shiftMonth(startMonth.year, startMonth.month, 1);
  const end = addDays(formatYmd(next.year, next.month, effectivePayday(next.year, next.month, payday)), -1);
  return { start, end, totalDays: diffDays(start, end) + 1 };
}

/** Days remaining in the cycle including today (minimum 1). */
export function daysLeftInCycle(today: DateKey, cycle: Cycle): number {
  return Math.max(1, diffDays(today, cycle.end) + 1);
}

/** max(0, (spendable − spentBeforeToday) ÷ daysLeft), rounded to the paisa. */
export function computeTodayBudget(spendablePaise: number, spentBeforeTodayPaise: number, daysLeft: number): number {
  const remaining = spendablePaise - spentBeforeTodayPaise;
  if (remaining <= 0) return 0;
  return Math.round(remaining / Math.max(1, Math.trunc(daysLeft)));
}
