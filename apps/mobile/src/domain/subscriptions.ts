import type { Paise } from './money';

export interface DetectedSubscription {
  name: string;
  amountPaise: Paise;
  dueDay: number;
  confidence: 'high' | 'medium';
  reason: 'mandate' | 'known_service' | 'recurring';
  merchantNorm: string;
  lastOccurredAt: number;
}

export interface SubscriptionTxLike {
  amountPaise: number;
  direction: string;
  occurredAt: number;
  merchant?: string | null;
  merchantNorm?: string | null;
  note?: string | null;
  rawBody?: string | null;
}

const AUTOPAY_KEYWORD_RE =
  /\b(autopay|auto\s*pay|e-?mandate|mandate|standing\s*instruction|si\s*debit|nach|ach\s*dr|ecs\s*dr)\b/i;

const KNOWN_SERVICES: { pattern: RegExp; name: string }[] = [
  // Subscriptions
  { pattern: /\bnetflix\b/i, name: 'Netflix' },
  { pattern: /\bspotify\b/i, name: 'Spotify' },
  { pattern: /\byoutube\b/i, name: 'YouTube Premium' },
  { pattern: /\bapple(\.com)?\b/i, name: 'Apple Services' },
  { pattern: /\b(disney\+?|hotstar)\b/i, name: 'Disney+ Hotstar' },
  { pattern: /\bprime(\s*video)?\b/i, name: 'Amazon Prime' },
  { pattern: /\btata\s*play\b/i, name: 'Tata Play' },
  // Investments / SIPs
  { pattern: /\b(groww|zerodha|camsonline|kfintech|cams)\b/i, name: 'SIP Investment' },
  { pattern: /\b(mutual\s*fund|mf\s*invest|sip\b)/i, name: 'Mutual Fund SIP' },
  // Loans & EMIs
  { pattern: /\b(bajaj\s*fin\w*|bajajfinsv)\b/i, name: 'Bajaj Finserv EMI' },
  { pattern: /\b(tata\s*cap\w*|tatacapital)\b/i, name: 'Tata Capital EMI' },
  { pattern: /\b(kreditbee|home\s*credit|zestmoney)\b/i, name: 'Loan EMI' },
  { pattern: /\b(emi\b|loan\s*debit)/i, name: 'Loan EMI' },
  // Broadband & Mobile
  { pattern: /\b(jio\s*fiber|jiofiber|airtel\s*broadband|act\s*corp)\b/i, name: 'Broadband' },
];

/**
 * Detects recurring monthly payments (Netflix, SIPs, EMIs, utilities, mandates)
 * from debit transactions so they can be suggested as fixed expenses.
 */
export function detectSubscriptions(txs: readonly SubscriptionTxLike[]): DetectedSubscription[] {
  const debits = txs.filter((t) => t.direction === 'debit');
  if (debits.length === 0) return [];

  const candidates = new Map<string, DetectedSubscription>();

  // Group transactions by normalized merchant (or note/keyword if merchant missing)
  const byMerchant = new Map<string, SubscriptionTxLike[]>();
  for (const tx of debits) {
    const text =
      `${tx.merchantNorm ?? ''} ${tx.merchant ?? ''} ${tx.note ?? ''} ${tx.rawBody ?? ''}`.trim();
    if (!text) continue;

    // Check known services first
    let groupKey = tx.merchantNorm || tx.merchant || '';
    for (const service of KNOWN_SERVICES) {
      if (service.pattern.test(text)) {
        groupKey = service.name.toLowerCase();
        break;
      }
    }

    if (!groupKey) continue;
    const list = byMerchant.get(groupKey) ?? [];
    list.push(tx);
    byMerchant.set(groupKey, list);
  }

  for (const [key, group] of byMerchant.entries()) {
    // Sort descending by occurrence
    group.sort((a, b) => b.occurredAt - a.occurredAt);
    const latest = group[0];
    if (!latest) continue;

    const text = `${latest.merchantNorm ?? ''} ${latest.merchant ?? ''} ${latest.note ?? ''} ${latest.rawBody ?? ''}`;

    let matchedService: string | null = null;
    for (const service of KNOWN_SERVICES) {
      if (service.pattern.test(text)) {
        matchedService = service.name;
        break;
      }
    }

    const hasAutopayKeyword = AUTOPAY_KEYWORD_RE.test(text);
    const displayName =
      matchedService ?? latest.merchant ?? latest.merchantNorm ?? 'Recurring Payment';

    const latestDate = new Date(latest.occurredAt);
    const dueDay = Math.max(1, Math.min(31, latestDate.getDate()));

    // Check if recurring (2+ transactions ~26 to 35 days apart with similar amount)
    let isRecurring = false;
    if (group.length >= 2) {
      for (let i = 0; i < group.length - 1; i++) {
        const a = group[i];
        const b = group[i + 1];
        if (!a || !b) continue;
        const diffAmount = Math.abs(a.amountPaise - b.amountPaise) / (a.amountPaise || 1);
        const daysApart = Math.round(Math.abs(a.occurredAt - b.occurredAt) / (1000 * 60 * 60 * 24));
        if (diffAmount <= 0.05 && daysApart >= 25 && daysApart <= 36) {
          isRecurring = true;
          break;
        }
      }
    }

    if (hasAutopayKeyword) {
      candidates.set(key, {
        name: displayName,
        amountPaise: latest.amountPaise,
        dueDay,
        confidence: 'high',
        reason: 'mandate',
        merchantNorm: latest.merchantNorm || key,
        lastOccurredAt: latest.occurredAt,
      });
    } else if (matchedService && (isRecurring || group.length >= 1)) {
      candidates.set(key, {
        name: displayName,
        amountPaise: latest.amountPaise,
        dueDay,
        confidence: isRecurring ? 'high' : 'medium',
        reason: 'known_service',
        merchantNorm: latest.merchantNorm || key,
        lastOccurredAt: latest.occurredAt,
      });
    } else if (isRecurring) {
      candidates.set(key, {
        name: displayName,
        amountPaise: latest.amountPaise,
        dueDay,
        confidence: 'medium',
        reason: 'recurring',
        merchantNorm: latest.merchantNorm || key,
        lastOccurredAt: latest.occurredAt,
      });
    }
  }

  return [...candidates.values()].sort((a, b) => b.amountPaise - a.amountPaise);
}
