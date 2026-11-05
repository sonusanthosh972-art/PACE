import { countsAsRefund, countsAsSpend, totalSpend, type SpendLike } from './budget';
import { CATEGORIES, type CategoryId } from './categories';
import type { Paise } from './money';
import { toDateKey, type DateKey } from './time';

export const SMALL_LEAK_LIMIT_PAISE: Paise = 500_00;

export interface InsightTx extends SpendLike {
  merchantNorm: string;
  merchantDisplay: string;
  occurredAt: number;
}

export interface CategoryTotal {
  category: CategoryId;
  totalPaise: Paise;
  count: number;
}

export function totalsByCategory(txs: readonly InsightTx[]): CategoryTotal[] {
  const map = new Map<CategoryId, CategoryTotal>();
  for (const tx of txs) {
    if (!countsAsSpend(tx)) continue;
    const entry = map.get(tx.category) ?? { category: tx.category, totalPaise: 0, count: 0 };
    entry.totalPaise += tx.amountPaise;
    entry.count += 1;
    map.set(tx.category, entry);
  }
  return [...map.values()].sort((a, b) => b.totalPaise - a.totalPaise);
}

export interface SmallLeaks {
  count: number;
  totalPaise: Paise;
}

/** Spend payments under ₹500. */
export function smallLeaks(
  txs: readonly InsightTx[],
  limitPaise: Paise = SMALL_LEAK_LIMIT_PAISE,
): SmallLeaks {
  let count = 0;
  let totalPaise = 0;
  for (const tx of txs) {
    if (countsAsSpend(tx) && tx.amountPaise < limitPaise) {
      count += 1;
      totalPaise += tx.amountPaise;
    }
  }
  return { count, totalPaise };
}

export interface MerchantTotal {
  merchantNorm: string;
  merchantDisplay: string;
  totalPaise: Paise;
  count: number;
}

export function topMerchants(txs: readonly InsightTx[], limit = 3): MerchantTotal[] {
  const map = new Map<string, MerchantTotal>();
  for (const tx of txs) {
    if (!countsAsSpend(tx) || !tx.merchantNorm) continue;
    const entry = map.get(tx.merchantNorm) ?? {
      merchantNorm: tx.merchantNorm,
      merchantDisplay: tx.merchantDisplay,
      totalPaise: 0,
      count: 0,
    };
    entry.totalPaise += tx.amountPaise;
    entry.count += 1;
    map.set(tx.merchantNorm, entry);
  }
  return [...map.values()]
    .sort((a, b) => b.totalPaise - a.totalPaise || b.count - a.count)
    .slice(0, limit);
}

export interface EssentialSplit {
  essentialPaise: Paise;
  nonEssentialPaise: Paise;
}

export function essentialSplit(txs: readonly InsightTx[]): EssentialSplit {
  let essentialPaise = 0;
  let nonEssentialPaise = 0;
  for (const tx of txs) {
    if (!countsAsSpend(tx)) continue;
    if (CATEGORIES[tx.category].isEssential) essentialPaise += tx.amountPaise;
    else nonEssentialPaise += tx.amountPaise;
  }
  return { essentialPaise, nonEssentialPaise };
}

/** Net spend per day (spend − refunds, floored at zero), independent of the order of payments. */
export function dailySpend(txs: readonly InsightTx[]): Map<DateKey, Paise> {
  const byDay = new Map<DateKey, InsightTx[]>();
  for (const tx of txs) {
    const key = toDateKey(tx.occurredAt);
    byDay.set(key, [...(byDay.get(key) ?? []), tx]);
  }
  const map = new Map<DateKey, Paise>();
  for (const [key, dayTxs] of byDay) {
    if (dayTxs.some((t) => countsAsSpend(t) || countsAsRefund(t))) map.set(key, totalSpend(dayTxs));
  }
  return map;
}

/** Categories shown as today's tiles when nothing else has been spent on yet. */
export const DEFAULT_TILE_CATEGORIES: readonly CategoryId[] = [
  'food',
  'transport',
  'shopping',
  'bills',
];

/**
 * The home screen's category tiles: today's biggest spending categories first, topped up with the
 * everyday defaults, always exactly `count` tiles.
 */
export function categoryTiles(
  txs: readonly InsightTx[],
  count = 4,
): { category: CategoryId; totalPaise: Paise }[] {
  const spent = totalsByCategory(txs).filter((c) => c.category !== 'uncategorised');
  const tiles = spent
    .slice(0, count)
    .map((c) => ({ category: c.category, totalPaise: c.totalPaise }));
  for (const id of DEFAULT_TILE_CATEGORIES) {
    if (tiles.length >= count) break;
    if (!tiles.some((t) => t.category === id)) tiles.push({ category: id, totalPaise: 0 });
  }
  return tiles;
}
