import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

import { merchantsMatch } from './merchant';
import { MINUTE_MS } from './time';
import type { Direction, Source } from './transaction';

export const DEDUPE_WINDOW_MS = 3 * MINUTE_MS;

export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}

export interface DedupeKeyInput {
  upiRef: string | null;
  amountPaise: number;
  accountLast4: string | null;
  occurredAt: number;
}

/**
 * dedupeHash = sha256(upiRef) when a reference exists, else sha256(amount|last4|minuteBucket).
 * The unique (userId, dedupeHash) index catches exact repeats (e.g. re-importing the same SMS);
 * findDuplicate() handles the ±3 minute window across sources.
 */
export function computeDedupeHash(input: DedupeKeyInput): string {
  if (input.upiRef) return sha256Hex(input.upiRef);
  const minuteBucket = Math.floor(input.occurredAt / MINUTE_MS);
  return sha256Hex(`${input.amountPaise}|${input.accountLast4 ?? ''}|${minuteBucket}`);
}

/** Manual entries are never duplicates of anything; their hash is unique per entry. */
export function manualDedupeHash(id: string): string {
  return sha256Hex(`manual|${id}`);
}

export interface DedupeCandidate {
  amountPaise: number;
  direction: Direction;
  accountLast4: string | null;
  merchantNorm: string;
  upiRef: string | null;
  occurredAt: number;
  source: Source;
}

export function isDuplicate(a: DedupeCandidate, b: DedupeCandidate): boolean {
  if (a.source === 'manual' || b.source === 'manual') return false;

  // 1. Same reference → duplicate. Two different references are definitively different payments.
  if (a.upiRef && b.upiRef) return a.upiRef === b.upiRef;

  // 2. Same amount (and direction) within ±3 minutes, plus same account or same merchant.
  if (a.amountPaise !== b.amountPaise || a.direction !== b.direction) return false;
  if (Math.abs(a.occurredAt - b.occurredAt) > DEDUPE_WINDOW_MS) return false;

  if (a.accountLast4 && b.accountLast4) return a.accountLast4 === b.accountLast4;
  if (merchantsMatch(a.merchantNorm, b.merchantNorm)) return true;

  // An app notification rarely carries the account number; an SMS and a notification for
  // the same amount within three minutes are the same payment.
  return a.source !== b.source;
}

export function findDuplicate<T extends DedupeCandidate>(
  candidate: DedupeCandidate,
  existing: readonly T[],
): T | null {
  return existing.find((e) => isDuplicate(candidate, e)) ?? null;
}
