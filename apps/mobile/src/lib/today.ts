import { formatINRWhole } from '@/domain/money';

export type RingTone = 'ok' | 'warn' | 'over';

/** Ring colour band: green under 80%, amber 80–100%, coral when over. */
export function ringTone(usedRatio: number): RingTone {
  if (usedRatio > 1) return 'over';
  if (usedRatio >= 0.8) return 'warn';
  return 'ok';
}

/** "Yesterday: ₹2,100 spent (₹521 over)" / "(₹420 saved)". */
export function yesterdayLine(
  y: { budgetPaise: number; spentPaise: number } | null,
): string | null {
  if (!y) return null;
  const diff = y.budgetPaise - y.spentPaise;
  return diff >= 0
    ? `Yesterday: ${formatINRWhole(y.spentPaise)} spent (${formatINRWhole(diff)} saved)`
    : `Yesterday: ${formatINRWhole(y.spentPaise)} spent (${formatINRWhole(-diff)} over)`;
}
