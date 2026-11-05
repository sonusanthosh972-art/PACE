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
  shortLabel: string;
  emoji: string;
  icon: string;
  isEssential: boolean;
  /** Fixed costs are budgeted up-front via fixedExpenses, so they never count against the daily budget. */
  isFixed: boolean;
}

export const CATEGORIES: Readonly<Record<CategoryId, Category>> = {
  food: {
    id: 'food',
    label: 'Food & Dining',
    shortLabel: 'Food',
    emoji: '🍽️',
    icon: 'restaurant-outline',
    isEssential: false,
    isFixed: false,
  },
  coffee: {
    id: 'coffee',
    label: 'Coffee & Snacks',
    shortLabel: 'Coffee',
    emoji: '☕',
    icon: 'cafe-outline',
    isEssential: false,
    isFixed: false,
  },
  groceries: {
    id: 'groceries',
    label: 'Groceries & Quick Commerce',
    shortLabel: 'Groceries',
    emoji: '🛒',
    icon: 'basket-outline',
    isEssential: true,
    isFixed: false,
  },
  transport: {
    id: 'transport',
    label: 'Transport',
    shortLabel: 'Transport',
    emoji: '🚕',
    icon: 'car-outline',
    isEssential: true,
    isFixed: false,
  },
  shopping: {
    id: 'shopping',
    label: 'Shopping',
    shortLabel: 'Shopping',
    emoji: '🛍️',
    icon: 'bag-handle-outline',
    isEssential: false,
    isFixed: false,
  },
  bills: {
    id: 'bills',
    label: 'Bills & Recharge',
    shortLabel: 'Bills',
    emoji: '💡',
    icon: 'flash-outline',
    isEssential: true,
    isFixed: false,
  },
  subscriptions: {
    id: 'subscriptions',
    label: 'Subscriptions',
    shortLabel: 'Subscriptions',
    emoji: '🔁',
    icon: 'repeat-outline',
    isEssential: false,
    isFixed: false,
  },
  entertainment: {
    id: 'entertainment',
    label: 'Entertainment',
    shortLabel: 'Entertainment',
    emoji: '🎬',
    icon: 'film-outline',
    isEssential: false,
    isFixed: false,
  },
  health: {
    id: 'health',
    label: 'Health',
    shortLabel: 'Health',
    emoji: '💊',
    icon: 'medkit-outline',
    isEssential: true,
    isFixed: false,
  },
  rent_emi: {
    id: 'rent_emi',
    label: 'Rent & EMI',
    shortLabel: 'Rent & EMI',
    emoji: '🏠',
    icon: 'home-outline',
    isEssential: true,
    isFixed: true,
  },
  transfers: {
    id: 'transfers',
    label: 'Transfers to people',
    shortLabel: 'Transfers',
    emoji: '👥',
    icon: 'people-outline',
    isEssential: false,
    isFixed: false,
  },
  cash: {
    id: 'cash',
    label: 'Cash/ATM',
    shortLabel: 'Cash',
    emoji: '💵',
    icon: 'cash-outline',
    isEssential: false,
    isFixed: false,
  },
  other: {
    id: 'other',
    label: 'Other',
    shortLabel: 'Other',
    emoji: '📦',
    icon: 'cube-outline',
    isEssential: false,
    isFixed: false,
  },
  uncategorised: {
    id: 'uncategorised',
    label: 'Uncategorised',
    shortLabel: 'Needs tag',
    emoji: '❔',
    icon: 'help-circle-outline',
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
