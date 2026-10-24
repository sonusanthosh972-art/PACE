import type { Transaction } from '@/domain/transaction';

import {
  formatDayLabel,
  formatShortDate,
  formatTime,
  formatTimeOfDay,
  ordinal,
  sanitiseAmountInput,
  shiftTime,
  transactionsToCsv,
  txTitle,
} from '../format';
import { ringTone, yesterdayLine } from '../today';

describe('IST formatting', () => {
  it('formats times in IST regardless of device zone', () => {
    expect(formatTime(Date.UTC(2026, 9, 24, 3, 35))).toBe('9:05 am');
    expect(formatTime(Date.UTC(2026, 9, 24, 18, 29))).toBe('11:59 pm');
    expect(formatTime(Date.UTC(2026, 9, 24, 6, 30))).toBe('12:00 pm');
  });

  it('labels days relative to today', () => {
    expect(formatDayLabel('2026-10-24', '2026-10-24')).toBe('Today');
    expect(formatDayLabel('2026-10-23', '2026-10-24')).toBe('Yesterday');
    expect(formatDayLabel('2026-10-21', '2026-10-24')).toBe('Wed, 21 Oct');
    expect(formatShortDate('2026-01-05')).toBe('5 Jan');
  });

  it('formats and shifts times of day', () => {
    expect(formatTimeOfDay({ hour: 8, minute: 0 })).toBe('8:00 am');
    expect(formatTimeOfDay({ hour: 22, minute: 15 })).toBe('10:15 pm');
    expect(shiftTime({ hour: 23, minute: 50 }, 15)).toEqual({ hour: 0, minute: 5 });
    expect(shiftTime({ hour: 0, minute: 0 }, -15)).toEqual({ hour: 23, minute: 45 });
  });

  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 31].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '31st',
    ]);
  });
});

describe('amount input', () => {
  it.each([
    ['₹1,250.50', '1250.50'],
    ['300', '300'],
    ['12.345', '12.34'],
    ['1.2.3', '1.23'],
    ['abc', ''],
  ])('%s → %s', (input, expected) => {
    expect(sanitiseAmountInput(input)).toBe(expected);
  });
});

describe('today helpers', () => {
  it('ring tone bands', () => {
    expect(ringTone(0)).toBe('ok');
    expect(ringTone(0.79)).toBe('ok');
    expect(ringTone(0.8)).toBe('warn');
    expect(ringTone(1)).toBe('warn');
    expect(ringTone(1.01)).toBe('over');
  });

  it('yesterday line (spec copy)', () => {
    expect(yesterdayLine({ budgetPaise: 157900, spentPaise: 210000 })).toBe(
      'Yesterday: ₹2,100 spent (₹521 over)',
    );
    expect(yesterdayLine({ budgetPaise: 157900, spentPaise: 115900 })).toBe(
      'Yesterday: ₹1,159 spent (₹420 saved)',
    );
    expect(yesterdayLine(null)).toBeNull();
  });
});

const tx = (p: Partial<Transaction>): Transaction => ({
  id: 'a',
  amountPaise: 125050,
  direction: 'debit',
  accountLast4: '1234',
  merchant: 'Third Wave, "Indiranagar"',
  merchantNorm: 'third wave indiranagar',
  vpa: null,
  mode: 'UPI',
  upiRef: '429812345678',
  balancePaise: null,
  category: 'coffee',
  needsReview: false,
  note: null,
  source: 'sms',
  occurredAt: Date.UTC(2026, 9, 24, 4, 45),
  dedupeHash: 'f'.repeat(64),
  isExcluded: false,
  createdAt: 1,
  updatedAt: 1,
  ...p,
});

describe('titles and CSV', () => {
  it('uses merchant, VPA or a sensible fallback', () => {
    expect(txTitle(tx({ merchant: null, vpa: 'zepto@ybl' }))).toBe('Zepto');
    expect(txTitle(tx({ merchant: null, vpa: null, mode: 'ATM' }))).toBe('ATM withdrawal');
    expect(txTitle(tx({ merchant: null, vpa: null, source: 'manual', note: 'Chai' }))).toBe('Chai');
  });

  it('exports RFC 4180 CSV with rupee amounts and IST dates', () => {
    const csv = transactionsToCsv([tx({}), tx({ amountPaise: 5, isExcluded: true })]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(
      'date,time,direction,amount_inr,merchant,category,mode,account_last4,reference,source,excluded,note',
    );
    expect(lines[1]).toBe(
      '2026-10-24,10:15 am,debit,1250.50,"Third Wave, ""Indiranagar""",Coffee & Snacks,UPI,1234,429812345678,sms,no,',
    );
    expect(lines[2]).toContain(',0.05,');
    expect(lines[2]).toContain(',yes,');
  });
});
