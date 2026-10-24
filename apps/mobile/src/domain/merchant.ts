const NOISE_WORDS = new Set([
  'pvt',
  'ltd',
  'private',
  'limited',
  'llp',
  'inc',
  'the',
  'india',
  'in',
  'co',
]);

/**
 * Normalises a merchant name or VPA for matching: lowercase, alphanumerics only,
 * corporate noise words removed. "Swiggy Pvt. Ltd." → "swiggy"; "swiggy.stores@axb" → "swiggy stores".
 */
export function normaliseMerchant(merchant: string | null, vpa: string | null): string {
  let base = merchant ?? vpa ?? '';
  const at = base.indexOf('@');
  if (at > 0) base = base.slice(0, at);
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 0 && !NOISE_WORDS.has(w))
    .join(' ');
}

export function compact(norm: string): string {
  return norm.replace(/\s+/g, '');
}

/** Loose match for the same merchant seen via different sources (SMS vs app notification). */
export function merchantsMatch(a: string, b: string): boolean {
  const ca = compact(a);
  const cb = compact(b);
  if (ca.length < 3 || cb.length < 3) return false;
  if (ca.includes(cb) || cb.includes(ca)) return true;
  return ca.length >= 5 && cb.length >= 5 && ca.slice(0, 5) === cb.slice(0, 5);
}

/** Title-cases a normalised merchant for display when no nicer name exists. */
export function displayMerchant(merchant: string | null, vpa: string | null): string {
  if (merchant && !merchant.includes('@')) return merchant;
  const norm = normaliseMerchant(merchant, vpa);
  if (!norm) return merchant ?? vpa ?? 'Unknown';
  return norm.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
