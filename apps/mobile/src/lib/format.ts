import { CATEGORIES } from '@/domain/categories';
import { displayMerchant } from '@/domain/merchant';
import { addDays, IST_OFFSET_MS, parseDateKey, toDateKey, type DateKey } from '@/domain/time';
import type { Mode, Transaction } from '@/domain/transaction';

// Formatting is done by hand in IST so it never depends on device time zone or Intl tz support.

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** "9:05 am" in IST. */
export function formatTime(epochMs: number): string {
  const d = new Date(epochMs + IST_OFFSET_MS);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

/** "21 Oct" */
export function formatShortDate(key: DateKey): string {
  const { month, day } = parseDateKey(key);
  return `${day} ${MONTHS[month - 1] ?? ''}`;
}

/** "Today", "Yesterday", or "Mon, 21 Oct". */
export function formatDayLabel(key: DateKey, today: DateKey): string {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  const { year, month, day } = parseDateKey(key);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? '';
  return `${weekday}, ${day} ${MONTHS[month - 1] ?? ''}`;
}

export function formatDateTime(epochMs: number, today: DateKey): string {
  return `${formatDayLabel(toDateKey(epochMs), today)} · ${formatTime(epochMs)}`;
}

export function formatTimeOfDay(t: { hour: number; minute: number }): string {
  return `${t.hour % 12 || 12}:${String(t.minute).padStart(2, '0')} ${t.hour < 12 ? 'am' : 'pm'}`;
}

/** Moves a time of day by `minutes`, wrapping around midnight. */
export function shiftTime(
  t: { hour: number; minute: number },
  minutes: number,
): { hour: number; minute: number } {
  const total = (((t.hour * 60 + t.minute + minutes) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export const MODE_LABELS: Record<Mode, string> = {
  UPI: 'UPI',
  CARD: 'Card',
  NEFT: 'NEFT',
  IMPS: 'IMPS',
  ATM: 'ATM',
  AUTOPAY: 'AutoPay',
  OTHER: 'Other',
};

export function txTitle(tx: Pick<Transaction, 'merchant' | 'vpa' | 'mode' | 'source' | 'note'>) {
  if (tx.merchant || tx.vpa) return displayMerchant(tx.merchant, tx.vpa);
  if (tx.mode === 'ATM') return 'ATM withdrawal';
  if (tx.source === 'manual') return tx.note ?? 'Cash';
  return 'Payment';
}

export function categoryLabel(tx: Pick<Transaction, 'category'>): string {
  return CATEGORIES[tx.category].label;
}

/** "₹1,250.50" → 125050; tolerates spaces and the ₹ symbol. */
export function sanitiseAmountInput(text: string): string {
  const cleaned = text.replace(/[^\d.]/g, '');
  const [whole = '', ...rest] = cleaned.split('.');
  const fraction = rest.join('').slice(0, 2);
  return rest.length > 0 ? `${whole}.${fraction}` : whole;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** CSV export of transactions (RFC 4180 quoting). Amounts in rupees with 2 decimals. */
export function transactionsToCsv(txs: readonly Transaction[]): string {
  const header = [
    'date',
    'time',
    'direction',
    'amount_inr',
    'merchant',
    'category',
    'mode',
    'account_last4',
    'reference',
    'source',
    'excluded',
    'note',
  ];
  const quote = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rupees = (p: number) => `${Math.trunc(p / 100)}.${String(p % 100).padStart(2, '0')}`;
  const lines = txs.map((t) =>
    [
      toDateKey(t.occurredAt),
      formatTime(t.occurredAt),
      t.direction,
      rupees(t.amountPaise),
      txTitle(t),
      CATEGORIES[t.category].label,
      t.mode,
      t.accountLast4 ?? '',
      t.upiRef ?? '',
      t.source,
      t.isExcluded ? 'yes' : 'no',
      t.note ?? '',
    ]
      .map(quote)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n') + '\n';
}
