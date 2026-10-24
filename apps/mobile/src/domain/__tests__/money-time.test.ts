import { divideRound, formatINR, formatINRWhole, parseRupeesToPaise, sumPaise } from '../money';
import {
  addDays,
  atTimeMs,
  dayOfWeek,
  daysInMonth,
  diffDays,
  startOfDayMs,
  toDateKey,
} from '../time';

describe('parseRupeesToPaise', () => {
  it.each([
    ['300', 30000],
    ['300.0', 30000],
    ['300.00', 30000],
    ['1,250.50', 125050],
    ['1,00,000', 10000000],
    ['0.05', 5],
    ['2,500', 250000],
    ['0.1', 10],
  ])('%s → %i paise', (input, expected) => {
    expect(parseRupeesToPaise(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '12a', '-5'])('rejects %s', (input) => {
    expect(parseRupeesToPaise(input)).toBeNull();
  });

  it('avoids float error (0.1 + 0.2 class bugs)', () => {
    expect(sumPaise([parseRupeesToPaise('0.10') ?? 0, parseRupeesToPaise('0.20') ?? 0])).toBe(30);
  });
});

describe('formatting', () => {
  it('uses Indian grouping', () => {
    expect(formatINR(10000000)).toBe('₹1,00,000.00');
    expect(formatINRWhole(157931)).toBe('₹1,579');
    expect(formatINRWhole(-52069)).toBe('-₹521');
  });
});

describe('divideRound', () => {
  it('rounds half away from zero', () => {
    expect(divideRound(5000000, 30)).toBe(166667);
    expect(divideRound(5, 2)).toBe(3);
    expect(divideRound(-5, 2)).toBe(-3);
    expect(divideRound(4, 2)).toBe(2);
  });
  it('rejects bad divisors', () => {
    expect(() => divideRound(1, 0)).toThrow(RangeError);
    expect(() => divideRound(1, 1.5)).toThrow(RangeError);
  });
});

describe('IST calendar', () => {
  it('maps instants to IST dates (UTC 19:00 is next day in IST)', () => {
    expect(toDateKey(Date.UTC(2026, 9, 24, 18, 29))).toBe('2026-10-24');
    expect(toDateKey(Date.UTC(2026, 9, 24, 18, 30))).toBe('2026-10-25');
  });

  it('computes local times', () => {
    expect(startOfDayMs('2026-10-25')).toBe(Date.UTC(2026, 9, 24, 18, 30));
    expect(atTimeMs('2026-10-25', 8, 0)).toBe(Date.UTC(2026, 9, 25, 2, 30));
  });

  it('adds and diffs days across months and leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-02-01', '2026-03-01')).toBe(28);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(dayOfWeek('2026-10-25')).toBe(0); // Sunday
  });
});
