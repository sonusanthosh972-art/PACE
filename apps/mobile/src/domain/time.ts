/**
 * Calendar maths in Asia/Kolkata. India has no DST, so a fixed +05:30 offset is exact.
 * Dates are represented as "YYYY-MM-DD" keys; instants as epoch milliseconds.
 */
export const IST_OFFSET_MS = 330 * 60 * 1000;
export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

export type DateKey = string; // YYYY-MM-DD

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toDateKey(epochMs: number): DateKey {
  const d = new Date(epochMs + IST_OFFSET_MS);
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function formatYmd(year: number, month: number, day: number): DateKey {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const m = DATE_KEY_RE.exec(key);
  if (!m) throw new RangeError(`Invalid date key: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Epoch ms of 00:00 IST on the given date. */
export function startOfDayMs(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return Date.UTC(year, month - 1, day) - IST_OFFSET_MS;
}

/** Epoch ms of hh:mm IST on the given date. */
export function atTimeMs(key: DateKey, hour: number, minute: number): number {
  return startOfDayMs(key) + (hour * 60 + minute) * MINUTE_MS;
}

export function addDays(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Whole days from a to b (b − a). */
export function diffDays(a: DateKey, b: DateKey): number {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / DAY_MS,
  );
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Sunday … 6 = Saturday, for an IST date key. */
export function dayOfWeek(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
