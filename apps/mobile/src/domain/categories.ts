export const CATEGORY_IDS = [
  'food',
  'coffee',
  'groceries',
  'transport',
  'shopping',
  'bills',
  'subscriptions',
  'entertainment',
  'health',
  'rent_emi',
  'transfers',
  'cash',
  'other',
  'uncategorised',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  isEssential: boolean;
  /** Fixed costs are budgeted up-front via fixedExpenses, so they never count against the daily budget. */
  isFixed: boolean;
}

export const CATEGORIES: Readonly<Record<CategoryId, Category>> = {
  food: { id: 'food', label: 'Food & Dining', emoji: '🍽️', isEssential: false, isFixed: false },
  coffee: {
    id: 'coffee',
    label: 'Coffee & Snacks',
    emoji: '☕',
    isEssential: false,
    isFixed: false,
  },
  groceries: {
    id: 'groceries',
    label: 'Groceries & Quick Commerce',
    emoji: '🛒',
    isEssential: true,
    isFixed: false,
  },
  transport: {
    id: 'transport',
    label: 'Transport',
    emoji: '🚕',
    isEssential: true,
    isFixed: false,
  },
  shopping: { id: 'shopping', label: 'Shopping', emoji: '🛍️', isEssential: false, isFixed: false },
  bills: {
    id: 'bills',
    label: 'Bills & Recharge',
    emoji: '💡',
    isEssential: true,
    isFixed: false,
  },
  subscriptions: {
    id: 'subscriptions',
    label: 'Subscriptions',
    emoji: '🔁',
    isEssential: false,
    isFixed: false,
  },
  entertainment: {
    id: 'entertainment',
    label: 'Entertainment',
    emoji: '🎬',
    isEssential: false,
    isFixed: false,
  },
  health: { id: 'health', label: 'Health', emoji: '💊', isEssential: true, isFixed: false },
  rent_emi: { id: 'rent_emi', label: 'Rent & EMI', emoji: '🏠', isEssential: true, isFixed: true },
  transfers: {
    id: 'transfers',
    label: 'Transfers to people',
    emoji: '👥',
    isEssential: false,
    isFixed: false,
  },
  cash: { id: 'cash', label: 'Cash/ATM', emoji: '💵', isEssential: false, isFixed: false },
  other: { id: 'other', label: 'Other', emoji: '📦', isEssential: false, isFixed: false },
  uncategorised: {
    id: 'uncategorised',
    label: 'Uncategorised',
    emoji: '❔',
    isEssential: false,
    isFixed: false,
  },
};

export const CATEGORY_LIST: readonly Category[] = CATEGORY_IDS.map((id) => CATEGORIES[id]);

/** Categories a user can pick when re-categorising (everything except the placeholder). */
export const PICKABLE_CATEGORIES: readonly Category[] = CATEGORY_LIST.filter(
  (c) => c.id !== 'uncategorised',
);

export function isCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}
