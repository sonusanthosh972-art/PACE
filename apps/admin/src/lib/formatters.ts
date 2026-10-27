export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(rupees);
}

export function formatINRCompact(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 1_00_00_000) {
    return `₹${(rupees / 1_00_00_000).toFixed(2)} Cr`;
  }
  if (rupees >= 1_00_000) {
    return `₹${(rupees / 1_00_000).toFixed(2)} L`;
  }
  if (rupees >= 1_000) {
    return `₹${(rupees / 1_000).toFixed(1)}k`;
  }
  return `₹${Math.round(rupees)}`;
}

export function formatDate(timestamp: number | string): string {
  const d = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0] || 'th');
}

export const CATEGORY_META: Record<string, { label: string; emoji: string; color: string }> = {
  food: { label: 'Food & Dining', emoji: '🍽️', color: '#F59E0B' },
  coffee: { label: 'Coffee & Snacks', emoji: '☕', color: '#D97706' },
  groceries: { label: 'Groceries & Quick Commerce', emoji: '🛒', color: '#10B981' },
  transport: { label: 'Transport', emoji: '🚕', color: '#06B6D4' },
  shopping: { label: 'Shopping', emoji: '🛍️', color: '#EC4899' },
  bills: { label: 'Bills & Utilities', emoji: '💡', color: '#3B82F6' },
  subscriptions: { label: 'Subscriptions', emoji: '🔁', color: '#8B5CF6' },
  entertainment: { label: 'Entertainment', emoji: '🎬', color: '#6366F1' },
  health: { label: 'Health & Pharmacy', emoji: '💊', color: '#EF4444' },
  rent_emi: { label: 'Rent & EMI', emoji: '🏠', color: '#14B8A6' },
  transfers: { label: 'Transfers to people', emoji: '👥', color: '#84CC16' },
  cash: { label: 'Cash/ATM', emoji: '💵', color: '#64748B' },
  other: { label: 'Other', emoji: '📦', color: '#94A3B8' },
  uncategorised: { label: 'Uncategorised', emoji: '❔', color: '#475569' },
};
