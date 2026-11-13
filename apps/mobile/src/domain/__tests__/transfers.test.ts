import { MINUTE_MS } from '../time';
import {
  CARD_BILL_WINDOW_MS,
  findTransferPairs,
  payeeExcludeReason,
  SELF_TRANSFER_WINDOW_MS,
  type PairCandidate,
} from '../transfers';

const T = Date.UTC(2026, 10, 3, 6, 0);

const tx = (p: Partial<PairCandidate> & Pick<PairCandidate, 'id'>): PairCandidate => ({
  amountPaise: 5_000_00,
  direction: 'debit',
  accountLast4: '1234',
  occurredAt: T,
  isExcluded: false,
  excludeReason: null,
  ...p,
});

describe('payeeExcludeReason', () => {
  const debit = (merchantNorm: string, vpa: string | null = null) =>
    payeeExcludeReason({ merchantNorm, vpa, direction: 'debit' });

  it('recognises credit card bill payees by name or UPI ID', () => {
    expect(debit('cred club')).toBe('card_bill');
    expect(debit('sbi card')).toBe('card_bill');
    expect(debit('hdfc cc')).toBe('card_bill');
    expect(debit('payment', 'cred.club@axisb')).toBe('card_bill');
  });

  it('recognises investments', () => {
    expect(debit('mutual funds icc')).toBe('investment');
    expect(debit('zerodha broking')).toBe('investment');
    expect(debit('groww')).toBe('investment');
    expect(debit('nps trust')).toBe('investment');
  });

  it('leaves everyday shops alone, including names that only contain the letters', () => {
    expect(debit('credit union bakery')).toBeNull();
    expect(debit('incredible sweets')).toBeNull();
    expect(debit('sipra stores')).toBeNull();
    expect(debit('')).toBeNull();
  });

  it('only ever applies to money going out', () => {
    expect(
      payeeExcludeReason({ merchantNorm: 'cred club', vpa: null, direction: 'credit' }),
    ).toBeNull();
  });
});

describe('findTransferPairs', () => {
  it('pairs a bank debit with the card issuer’s "payment received" credit', () => {
    const matches = findTransferPairs([
      tx({ id: 'bank', accountLast4: '1234' }),
      tx({
        id: 'card',
        direction: 'credit',
        accountLast4: '9876',
        occurredAt: T + 2 * 24 * 60 * MINUTE_MS,
        isExcluded: true,
        excludeReason: 'card_bill',
      }),
    ]);
    expect(matches).toEqual([{ ids: ['bank'], reason: 'card_bill' }]);
  });

  it('ignores a card credit outside the 3-day window', () => {
    expect(
      findTransferPairs([
        tx({ id: 'bank' }),
        tx({
          id: 'card',
          direction: 'credit',
          accountLast4: '9876',
          occurredAt: T + CARD_BILL_WINDOW_MS + MINUTE_MS,
          isExcluded: true,
          excludeReason: 'card_bill',
        }),
      ]),
    ).toEqual([]);
  });

  it('pairs a debit and credit of the same amount between two of the user’s accounts', () => {
    const matches = findTransferPairs([
      tx({ id: 'out', accountLast4: '1234' }),
      tx({ id: 'in', direction: 'credit', accountLast4: '5678', occurredAt: T + 5 * MINUTE_MS }),
    ]);
    expect(matches).toEqual([{ ids: ['out', 'in'], reason: 'self_transfer' }]);
  });

  it('does not treat a friend paying back the same amount as a transfer', () => {
    // Same account on both sides, or an unknown account, can't be the user's own move.
    expect(
      findTransferPairs([
        tx({ id: 'out', accountLast4: '1234' }),
        tx({ id: 'in', direction: 'credit', accountLast4: '1234', occurredAt: T + MINUTE_MS }),
      ]),
    ).toEqual([]);
    expect(
      findTransferPairs([
        tx({ id: 'out', accountLast4: null }),
        tx({ id: 'in', direction: 'credit', accountLast4: '5678', occurredAt: T + MINUTE_MS }),
      ]),
    ).toEqual([]);
    expect(
      findTransferPairs([
        tx({ id: 'out' }),
        tx({
          id: 'in',
          direction: 'credit',
          accountLast4: '5678',
          occurredAt: T + SELF_TRANSFER_WINDOW_MS + MINUTE_MS,
        }),
      ]),
    ).toEqual([]);
  });

  it('uses each payment once, matching the closest in time', () => {
    const matches = findTransferPairs([
      tx({ id: 'out1', occurredAt: T }),
      tx({ id: 'out2', occurredAt: T + 20 * MINUTE_MS }),
      tx({ id: 'in1', direction: 'credit', accountLast4: '5678', occurredAt: T + 19 * MINUTE_MS }),
    ]);
    // out1 is earlier and still within 30 min of in1, so it claims it; out2 is left alone.
    expect(matches).toEqual([{ ids: ['out1', 'in1'], reason: 'self_transfer' }]);
  });

  it('never touches payments the user has already decided about', () => {
    expect(
      findTransferPairs([
        tx({ id: 'out', isExcluded: true, excludeReason: 'user' }),
        tx({ id: 'in', direction: 'credit', accountLast4: '5678', occurredAt: T + MINUTE_MS }),
      ]),
    ).toEqual([]);
  });
});
