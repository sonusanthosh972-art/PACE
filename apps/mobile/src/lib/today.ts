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

/** The headline and supporting line under the ring. Calm in every case, never a telling-off. */
export function statusCopy(args: {
  tone: RingTone;
  usedRatio: number;
  budgetPaise: number;
  streak: number;
  yesterday: string | null;
}): { title: string; body: string } {
  if (args.budgetPaise === 0) {
    return {
      title: 'Your allowance is resting',
      body: 'Fixed costs and savings take this cycle’s income first.',
    };
  }
  if (args.tone === 'over') {
    return {
      title: 'A little over today',
      body: 'Tomorrow starts fresh with the same allowance.',
    };
  }
  if (args.tone === 'warn') {
    return {
      title: 'Getting close for today',
      body: `You’ve used ${Math.round(args.usedRatio * 100)}% of today’s allowance.`,
    };
  }
  return {
    title: 'You’re right on track',
    body:
      args.streak >= 2
        ? `${args.streak} days in a row within your allowance.`
        : (args.yesterday ?? 'Calm and steady. Spend what today allows.'),
  };
}
