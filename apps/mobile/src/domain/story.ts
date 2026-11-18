/**
 * "Your Money Story" for one pay cycle: the category breakdown, a few plain-language patterns,
 * the biggest spending day and a quiet win. Pure; the Insights screen only renders the result.
 */
import { CATEGORIES, type CategoryId } from './categories';
import { dailySpend, totalsByCategory, type CategoryTotal, type InsightTx } from './insights';
import { formatINRWhole, type Paise } from './money';
import { parseDateKey, toDateKey, type DateKey } from './time';

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Nov 2026": a cycle is named after the month it starts in. */
export function cycleLabel(start: DateKey): string {
  const { year, month } = parseDateKey(start);
  return `${MONTHS_SHORT[month - 1] ?? ''} ${year}`;
}

/** "October": used in "₹1,150 lower than October". */
export function cycleMonthName(start: DateKey): string {
  return MONTHS_LONG[parseDateKey(start).month - 1] ?? '';
}

/* ---------------------------------------------------------------- category breakdown */

export interface BreakdownRow {
  key: string;
  /** null for the combined "Others" row. */
  category: CategoryId | null;
  label: string;
  totalPaise: Paise;
  pct: number;
}

/** The biggest `max` categories, then everything else combined as "Others". */
export function breakdown(byCategory: readonly CategoryTotal[], max = 4): BreakdownRow[] {
  const total = byCategory.reduce((s, c) => s + c.totalPaise, 0);
  if (total === 0) return [];
  const pct = (p: Paise) => Math.round((p / total) * 100);
  const top = byCategory.slice(0, byCategory.length > max + 1 ? max : max + 1);
  const rest = byCategory.slice(top.length);
  const rows: BreakdownRow[] = top.map((c) => ({
    key: c.category,
    category: c.category,
    label: CATEGORIES[c.category].shortLabel,
    totalPaise: c.totalPaise,
    pct: pct(c.totalPaise),
  }));
  if (rest.length > 0) {
    const others = rest.reduce((s, c) => s + c.totalPaise, 0);
    rows.push({
      key: 'others',
      category: null,
      label: 'Others',
      totalPaise: others,
      pct: pct(others),
    });
  }
  return rows;
}

/* ---------------------------------------------------------------- patterns */

export type PatternTone = 'accent' | 'amber' | 'category';
export interface Pattern {
  id: 'top' | 'allowance' | 'compare';
  icon: string;
  tone: PatternTone;
  category?: CategoryId;
  title: string;
  detail: string;
  /** Small pill after the detail, e.g. "On track". */
  badge?: string;
}

export interface PatternInput {
  byCategory: readonly CategoryTotal[];
  totalSpentPaise: Paise;
  /** Days of the cycle so far, each with its allowance (null = before budgeting began). */
  days: readonly { date: DateKey; spentPaise: Paise; budgetPaise: Paise | null }[];
  /** Days that are over; for the current cycle today is still going and is left out. */
  lastFinishedDay: DateKey;
  /** Spend in the comparable stretch of the previous cycle (same number of days). */
  previousPaise: Paise;
  previousStart: DateKey;
  /** True while the cycle is still running, so comparisons say "at this point". */
  inProgress: boolean;
}

/** Differences smaller than this read as "about the same": ₹100 or 5%, whichever is larger. */
function negligible(diff: Paise, base: Paise): boolean {
  return Math.abs(diff) < Math.max(100_00, base * 0.05);
}

export function buildPatterns(input: PatternInput): Pattern[] {
  const patterns: Pattern[] = [];
  const categoryTotal = input.byCategory.reduce((s, c) => s + c.totalPaise, 0);

  // 1. Where most of the money went.
  const top = input.byCategory.find((c) => c.category !== 'uncategorised') ?? input.byCategory[0];
  if (top && categoryTotal > 0) {
    const def = CATEGORIES[top.category];
    patterns.push({
      id: 'top',
      icon: def.icon,
      tone: 'category',
      category: top.category,
      title:
        top.category === 'uncategorised'
          ? 'Most payments still need a category.'
          : `${def.shortLabel} was your biggest expense this cycle.`,
      detail: `${formatINRWhole(top.totalPaise)} · ${Math.round((top.totalPaise / categoryTotal) * 100)}% of total spending`,
    });
  }

  // 2. How the days went against the allowance.
  const budgeted = input.days.filter((d) => d.budgetPaise !== null && d.budgetPaise > 0);
  const finished = budgeted.filter((d) => d.date <= input.lastFinishedDay);
  if (finished.length > 0) {
    const within = finished.filter((d) => d.spentPaise <= (d.budgetPaise ?? 0)).length;
    const perDay = Math.round(input.totalSpentPaise / Math.max(1, budgeted.length));
    const pace = `About ${formatINRWhole(perDay)} per day`;
    if (within === finished.length) {
      patterns.push({
        id: 'allowance',
        icon: 'leaf-outline',
        tone: 'accent',
        title: "You're staying within your daily allowance.",
        detail: pace,
        badge: 'On track',
      });
    } else if (within * 2 >= finished.length) {
      patterns.push({
        id: 'allowance',
        icon: 'leaf-outline',
        tone: 'accent',
        title: `${within} of ${finished.length} days stayed within your allowance.`,
        detail: pace,
      });
    } else {
      patterns.push({
        id: 'allowance',
        icon: 'sunny-outline',
        tone: 'amber',
        title: 'Some days ran above your allowance.',
        detail: `${pace} · the days ahead adjust to cover it`,
      });
    }
  }

  // 3. Against the previous cycle, over the same number of days.
  if (input.previousPaise > 0 && input.totalSpentPaise > 0) {
    const diff = input.previousPaise - input.totalSpentPaise;
    const pct = Math.round((Math.abs(diff) / input.previousPaise) * 100);
    const than = input.inProgress ? 'than at this point last cycle' : 'than last cycle';
    const month = cycleMonthName(input.previousStart);
    if (negligible(diff, input.previousPaise)) {
      patterns.push({
        id: 'compare',
        icon: 'swap-horizontal-outline',
        tone: 'accent',
        title: `You're spending about the same ${than}.`,
        detail: `${formatINRWhole(input.previousPaise)} in ${month}`,
      });
    } else if (diff > 0) {
      patterns.push({
        id: 'compare',
        icon: 'trending-down-outline',
        tone: 'accent',
        title: `You spent ${pct}% less ${than}.`,
        detail: `${formatINRWhole(diff)} lower than ${month}`,
      });
    } else {
      patterns.push({
        id: 'compare',
        icon: 'trending-up-outline',
        tone: 'amber',
        title: `You spent ${pct}% more ${than}.`,
        detail: `${formatINRWhole(-diff)} higher than ${month}`,
      });
    }
  }

  return patterns;
}

/* ---------------------------------------------------------------- highlight cards */

export interface BiggestDay {
  date: DateKey;
  totalPaise: Paise;
  categories: CategoryId[];
}

/** The day with the most spending, with its top three categories. */
export function biggestDay(txs: readonly InsightTx[]): BiggestDay | null {
  let best: { date: DateKey; totalPaise: Paise } | null = null;
  for (const [date, totalPaise] of dailySpend(txs)) {
    if (totalPaise > 0 && (!best || totalPaise > best.totalPaise)) best = { date, totalPaise };
  }
  if (!best) return null;
  const day = best.date;
  const onDay = txs.filter((t) => toDateKey(t.occurredAt) === day);
  return {
    ...best,
    categories: totalsByCategory(onDay)
      .slice(0, 3)
      .map((c) => c.category),
  };
}

/** Rendered as `before` + emphasised `strong` + `after`. */
export interface QuietWin {
  before: string;
  strong: string;
  after: string;
}

/**
 * Something that went well: the category with the biggest drop against the same stretch of last
 * cycle, or else the number of days within the allowance. Null when there is nothing honest to say.
 */
export function quietWin(args: {
  current: readonly CategoryTotal[];
  previous: readonly CategoryTotal[];
  daysWithin: number;
}): QuietWin | null {
  let best: { category: CategoryId; saved: Paise } | null = null;
  for (const p of args.previous) {
    if (p.category === 'uncategorised') continue;
    const now = args.current.find((c) => c.category === p.category)?.totalPaise ?? 0;
    const saved = p.totalPaise - now;
    if (saved >= 100_00 && (!best || saved > best.saved)) best = { category: p.category, saved };
  }
  if (best) {
    return {
      before: 'You spent ',
      strong: formatINRWhole(best.saved),
      after: ` less on ${CATEGORIES[best.category].shortLabel.toLowerCase()} this cycle.`,
    };
  }
  if (args.daysWithin > 0) {
    return {
      before: '',
      strong: `${args.daysWithin} ${args.daysWithin === 1 ? 'day' : 'days'}`,
      after: ' stayed within your daily allowance.',
    };
  }
  return null;
}
