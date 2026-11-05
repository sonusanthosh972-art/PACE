/**
 * Money that moves but is not spending: credit card bill payments (the card purchases were
 * already counted), transfers between the user's own accounts, and investments (SIPs, brokers).
 * Counting these would make the same rupee count twice or treat savings as spending.
 */
import { MINUTE_MS } from './time';
import type { Direction } from './transaction';

export const EXCLUDE_REASONS = ['card_bill', 'self_transfer', 'investment', 'user'] as const;
export type ExcludeReason = (typeof EXCLUDE_REASONS)[number];

/** Reasons the app decides on its own; 'user' means the user chose and is never overridden. */
export type AutoExcludeReason = Exclude<ExcludeReason, 'user'>;

export const EXCLUDE_NOTES: Readonly<Record<AutoExcludeReason, string>> = {
  card_bill: "Credit card bill payment — excluded so expenses aren't counted twice",
  self_transfer: 'Transfer between your own accounts',
  investment: 'Investment — counted towards savings, not spending',
};

/** Payees that collect credit card bills. Matched on the normalised merchant and the UPI ID. */
const CARD_BILL_PAYEE_RE =
  /\bcred\b|\bcred\s*club\b|\bcredclub\b|\bcc\s*(?:bill|pay(?:ment)?|pymt)\b|\bccpay\b|\bccbill\b|\bcredit\s*card\b|\bcreditcard\b|\bcard\s*bill\b|\bcardbill\b|\bbbps\s*cc\b|\bsbi\s*card\b|\bsbicard\b|\bamex\b|\bamerican\s*express\b|\bonecard\b|\b(?:hdfc|icici|axis|kotak|idfc|rbl|au|yes|indusind|hsbc|sbi)\s*cc\b/i;

/** Mutual funds, SIPs, brokers, pension and deposit schemes. */
const INVESTMENT_PAYEE_RE =
  /\bmutual\s*funds?\b|\bmutualfunds?\b|\bzerodha\b|\bgroww\b|\bkuvera\b|\bupstox\b|\bangel\s*one\b|\bangelone\b|\bpaytm\s*money\b|\bpaytmmoney\b|\bet\s*money\b|\betmoney\b|\bindmoney\b|\bcoin\s*by\s*zerodha\b|\bbse\s*star\s*mf\b|\bnse\s*clearing\b|\bnsecl\b|\biccl\b|\bindian\s*clearing\b|\bcams\b|\bcamsonline\b|\bkfintech\b|\bkfin\b|\bnps\s*trust\b|\bppf\b/i;

export interface PayeeLike {
  merchantNorm: string;
  vpa: string | null;
  direction: Direction;
}

/** Text the payee rules look at: merchant and UPI ID with punctuation turned into spaces. */
function payeeText(p: PayeeLike): string {
  return `${p.merchantNorm} ${(p.vpa ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')}`.trim();
}

/** Whether a payment's payee alone shows it is not spending. Only debits qualify. */
export function payeeExcludeReason(p: PayeeLike): AutoExcludeReason | null {
  if (p.direction !== 'debit') return null;
  const text = payeeText(p);
  if (!text) return null;
  if (CARD_BILL_PAYEE_RE.test(text)) return 'card_bill';
  if (INVESTMENT_PAYEE_RE.test(text)) return 'investment';
  return null;
}

/** A debit and a credit on two of the user's own accounts this close together are one transfer. */
export const SELF_TRANSFER_WINDOW_MS = 30 * MINUTE_MS;
/** A card issuer can confirm a bill payment a few days after the bank debit. */
export const CARD_BILL_WINDOW_MS = 3 * 24 * 60 * MINUTE_MS;

export interface PairCandidate {
  id: string;
  amountPaise: number;
  direction: Direction;
  accountLast4: string | null;
  occurredAt: number;
  isExcluded: boolean;
  excludeReason: ExcludeReason | null;
}

export interface PairMatch {
  ids: string[];
  reason: AutoExcludeReason;
}

/** Rows the user has not decided about and the app has not already excluded. */
function open(t: PairCandidate): boolean {
  return !t.isExcluded && t.excludeReason === null;
}

/**
 * Finds payments that are two halves of one movement of the user's own money:
 *
 * - **Card bill:** a bank debit with the same amount as a card's "payment received" credit
 *   (already excluded by the parser as card_bill) within 3 days, on a different account.
 * - **Self transfer:** a debit from one of the user's accounts and a credit of the same amount to
 *   another of their accounts within 30 minutes. Both sides need a known, different account, since
 *   a friend paying back the exact amount would otherwise look the same.
 *
 * Each row is used at most once, closest match in time first. Pure; the caller writes the result.
 */
export function findTransferPairs(txs: readonly PairCandidate[]): PairMatch[] {
  const used = new Set<string>();
  const matches: PairMatch[] = [];
  const debits = txs
    .filter((t) => t.direction === 'debit' && open(t))
    .sort((a, b) => a.occurredAt - b.occurredAt);

  const closest = (debit: PairCandidate, pool: readonly PairCandidate[], windowMs: number) => {
    let best: PairCandidate | null = null;
    for (const c of pool) {
      if (used.has(c.id) || c.amountPaise !== debit.amountPaise) continue;
      const gap = Math.abs(c.occurredAt - debit.occurredAt);
      if (gap > windowMs) continue;
      if (!best || gap < Math.abs(best.occurredAt - debit.occurredAt)) best = c;
    }
    return best;
  };

  const cardCredits = txs.filter(
    (t) => t.direction === 'credit' && t.isExcluded && t.excludeReason === 'card_bill',
  );
  const openCredits = txs.filter((t) => t.direction === 'credit' && open(t));

  for (const debit of debits) {
    if (used.has(debit.id)) continue;

    const card = closest(
      debit,
      cardCredits.filter((c) => c.accountLast4 === null || c.accountLast4 !== debit.accountLast4),
      CARD_BILL_WINDOW_MS,
    );
    if (card) {
      used.add(debit.id);
      used.add(card.id);
      matches.push({ ids: [debit.id], reason: 'card_bill' });
      continue;
    }

    if (debit.accountLast4 === null) continue;
    const credit = closest(
      debit,
      openCredits.filter((c) => c.accountLast4 !== null && c.accountLast4 !== debit.accountLast4),
      SELF_TRANSFER_WINDOW_MS,
    );
    if (credit) {
      used.add(debit.id);
      used.add(credit.id);
      matches.push({ ids: [debit.id, credit.id], reason: 'self_transfer' });
    }
  }
  return matches;
}
