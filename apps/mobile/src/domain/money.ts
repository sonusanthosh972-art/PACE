/**
 * Money is always an integer number of paise. Never use floats for amounts.
 * ₹1 = 100 paise. Number.MAX_SAFE_INTEGER paise ≈ ₹90 lakh crore, plenty.
 */
export type Paise = number;

const AMOUNT_RE = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses a human/bank formatted rupee amount ("1,250.50", "300", "300.0") into paise
 * using string arithmetic only. Returns null for anything that is not a plain amount.
 */
export function parseRupeesToPaise(text: string): Paise | null {
  const cleaned = text.replace(/,/g, '').trim();
  const match = AMOUNT_RE.exec(cleaned);
  if (!match) return null;
  const rupees = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const paise = Number(rupees) * 100 + Number(fraction);
  return Number.isSafeInteger(paise) ? paise : null;
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWholeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** ₹1,00,000.00. Formatting divides only at the display edge. */
export function formatINR(paise: Paise): string {
  return inrFormatter.format(paise / 100);
}

/** ₹1,00,000 (rounded to the nearest rupee) for compact UI and notifications. */
export function formatINRWhole(paise: Paise): string {
  return inrWholeFormatter.format(Math.round(paise / 100));
}

export function sumPaise(values: readonly Paise[]): Paise {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Integer division rounded half away from zero, for paise. */
export function divideRound(paise: Paise, divisor: number): Paise {
  if (divisor <= 0 || !Number.isInteger(divisor)) {
    throw new RangeError('divisor must be a positive integer');
  }
  const sign = paise < 0 ? -1 : 1;
  const abs = Math.abs(paise);
  const quotient = Math.floor(abs / divisor);
  const remainder = abs - quotient * divisor;
  return sign * (remainder * 2 >= divisor ? quotient + 1 : quotient);
}
