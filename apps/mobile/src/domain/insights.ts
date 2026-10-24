import { countsAsSpend, type SpendLike } from './budget';
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

export function dailySpend(txs: readonly InsightTx[]): Map<DateKey, Paise> {
  const map = new Map<DateKey, Paise>();
  for (const tx of txs) {
    if (!countsAsSpend(tx)) continue;
    const key = toDateKey(tx.occurredAt);
    map.set(key, (map.get(key) ?? 0) + tx.amountPaise);
  }
  return map;
}
