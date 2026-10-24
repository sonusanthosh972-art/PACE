import {
  computeDedupeHash,
  findDuplicate,
  isDuplicate,
  manualDedupeHash,
  sha256Hex,
  type DedupeCandidate,
} from '../dedupe';
import { MINUTE_MS } from '../time';

const T0 = Date.UTC(2026, 9, 24, 4, 45);

const sms: DedupeCandidate = {
  amountPaise: 30000,
  direction: 'debit',
  accountLast4: '1234',
  merchantNorm: 'third wave coffee',
  upiRef: null,
  occurredAt: T0,
  source: 'sms',
};

describe('hashes', () => {
  it('sha256 matches a known vector', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('uses sha256(upiRef) when a reference exists', () => {
    expect(
      computeDedupeHash({
        upiRef: '429812345678',
        amountPaise: 1,
        accountLast4: null,
        occurredAt: T0,
      }),
    ).toBe(sha256Hex('429812345678'));
  });

  it('uses sha256(amount|last4|minuteBucket) otherwise', () => {
    const bucket = Math.floor(T0 / MINUTE_MS);
    expect(
      computeDedupeHash({
        upiRef: null,
        amountPaise: 30000,
        accountLast4: '1234',
        occurredAt: T0 + 5000,
      }),
    ).toBe(sha256Hex(`30000|1234|${bucket}`));
  });

  it('gives each manual entry its own hash', () => {
    expect(manualDedupeHash('a')).not.toBe(manualDedupeHash('b'));
  });
});

describe('isDuplicate', () => {
  it('same upiRef → duplicate regardless of other fields', () => {
    expect(
      isDuplicate(
        { ...sms, upiRef: '1111111111' },
        { ...sms, upiRef: '1111111111', amountPaise: 1, occurredAt: T0 + 3_600_000 },
      ),
    ).toBe(true);
  });

  it('different upiRefs → never a duplicate', () => {
    expect(isDuplicate({ ...sms, upiRef: '1111111111' }, { ...sms, upiRef: '2222222222' })).toBe(
      false,
    );
  });

  it('same amount + last4 within 3 minutes → duplicate', () => {
    expect(isDuplicate(sms, { ...sms, occurredAt: T0 + 3 * MINUTE_MS })).toBe(true);
    expect(isDuplicate(sms, { ...sms, occurredAt: T0 - 2 * MINUTE_MS })).toBe(true);
  });

  it('outside the window → not a duplicate', () => {
    expect(isDuplicate(sms, { ...sms, occurredAt: T0 + 3 * MINUTE_MS + 1 })).toBe(false);
  });

  it('different accounts → not a duplicate', () => {
    expect(isDuplicate(sms, { ...sms, accountLast4: '9999' })).toBe(false);
  });

  it('different amount or direction → not a duplicate', () => {
    expect(isDuplicate(sms, { ...sms, amountPaise: 30001 })).toBe(false);
    expect(isDuplicate(sms, { ...sms, direction: 'credit' })).toBe(false);
  });

  it('SMS + app notification for the same payment (merchant match) → duplicate', () => {
    const notif: DedupeCandidate = {
      ...sms,
      accountLast4: null,
      merchantNorm: 'thirdwave',
      source: 'notification',
      occurredAt: T0 + 40_000,
    };
    expect(isDuplicate(sms, notif)).toBe(true);
  });

  it('SMS + notification without merchant match still dedupes when the notification lacks an account', () => {
    const notif: DedupeCandidate = {
      ...sms,
      accountLast4: null,
      merchantNorm: 'twc koramangala',
      source: 'notification',
    };
    expect(isDuplicate(sms, notif)).toBe(true);
  });

  it('manual entries never dedupe', () => {
    expect(isDuplicate(sms, { ...sms, source: 'manual' })).toBe(false);
  });

  it('findDuplicate returns the matching existing row', () => {
    const existing = [
      { ...sms, id: 'x', amountPaise: 999 },
      { ...sms, id: 'y' },
    ];
    expect(findDuplicate(sms, existing)?.id).toBe('y');
    expect(findDuplicate({ ...sms, amountPaise: 5 }, existing)).toBeNull();
  });
});
