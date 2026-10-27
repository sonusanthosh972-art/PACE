import type { Paise } from './money';

export interface SalaryCandidate {
  salaryPaise: Paise;
  payday: number;
  confidence: 'high' | 'medium';
  description: string;
  detectedAt: number;
}

export interface SalaryTxLike {
  amountPaise: number;
  direction: string;
  occurredAt: number;
  merchant?: string | null;
  merchantNorm?: string | null;
  note?: string | null;
  rawBody?: string | null;
}

const SALARY_KEYWORD_RE =
  /\b(salary|sal\s*cr|sal\s*credit|payroll|stipend|monthly\s*sal|wages|sal\b|corp\s*sal)\b/i;

const MIN_SALARY_PAISE: Paise = 10_000_00; // ₹10,000 min for salary detection

/**
 * Spots likely salary credits from historical transactions.
 * High confidence: Credit >= ₹10,000 with explicit salary keywords.
 * Medium confidence: Recurring credits >= ₹15,000 appearing across 2+ distinct months
 * around the same day of the month (within ±3 days or ~27-35 days apart).
 */
export function detectSalaryCandidate(txs: readonly SalaryTxLike[]): SalaryCandidate | null {
  const credits = txs.filter((t) => t.direction === 'credit' && t.amountPaise >= MIN_SALARY_PAISE);
  if (credits.length === 0) return null;

  // 1. High confidence: Look for explicit salary indicators
  const keywordMatches = credits.filter((t) => {
    const text = `${t.note ?? ''} ${t.merchant ?? ''} ${t.merchantNorm ?? ''} ${t.rawBody ?? ''}`;
    return SALARY_KEYWORD_RE.test(text);
  });

  if (keywordMatches.length > 0) {
    // Sort by occurredAt desc to find the latest salary credit
    keywordMatches.sort((a, b) => b.occurredAt - a.occurredAt);
    const latest = keywordMatches[0];
    if (latest) {
      const date = new Date(latest.occurredAt);
      const payday = Math.max(1, Math.min(31, date.getDate()));

      return {
        salaryPaise: latest.amountPaise,
        payday,
        confidence: 'high',
        description: latest.merchant ? `Salary from ${latest.merchant}` : 'Detected salary credit',
        detectedAt: latest.occurredAt,
      };
    }
  }

  // 2. Medium confidence: Look for recurring monthly credits >= ₹15,000
  const largeCredits = credits
    .filter((t) => t.amountPaise >= 15_000_00)
    .sort((a, b) => b.occurredAt - a.occurredAt);

  // Group credits that have similar amounts (within ±5%)
  for (let i = 0; i < largeCredits.length; i++) {
    const root = largeCredits[i];
    if (!root) continue;
    const group: SalaryTxLike[] = [root];

    for (let j = i + 1; j < largeCredits.length; j++) {
      const candidate = largeCredits[j];
      if (!candidate) continue;
      const diffAmount = Math.abs(candidate.amountPaise - root.amountPaise) / root.amountPaise;
      if (diffAmount <= 0.05) {
        // Check if spacing is between 25 and 36 days (or multiple thereof for monthly cycles)
        const daysApart = Math.round(
          Math.abs(root.occurredAt - candidate.occurredAt) / (1000 * 60 * 60 * 24),
        );
        if (daysApart >= 25 && daysApart <= 36) {
          group.push(candidate);
        }
      }
    }

    if (group.length >= 2) {
      const latest = group[0];
      if (latest) {
        const payday = Math.max(1, Math.min(31, new Date(latest.occurredAt).getDate()));
        return {
          salaryPaise: latest.amountPaise,
          payday,
          confidence: 'medium',
          description: 'Recurring monthly credit',
          detectedAt: latest.occurredAt,
        };
      }
    }
  }

  return null;
}
