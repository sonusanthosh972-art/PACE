/**
 * The once-a-day cards: a morning card that compares yesterday with today's carry-forward
 * allowance, and a night card (from the night time, 9 pm by default) about what is left today.
 * Pure: numbers in, words out. Calm and supportive in every case, never a telling-off.
 */
import { formatINRWhole, type Paise } from './money';
import { DAY_MS, IST_OFFSET_MS, MINUTE_MS } from './time';

export type DayCardKind = 'morning' | 'night';
/** Drives the illustration: celebrate (kept money), steady (exactly on), support (went over),
 *  neutral (no comparison possible), resting (the cycle's money is used up). */
export type DayCardMood = 'celebrate' | 'steady' | 'support' | 'neutral' | 'resting';

export interface DayCardStat {
  label: string;
  value: string;
}

export interface DayCard {
  kind: DayCardKind;
  mood: DayCardMood;
  title: string;
  message: string;
  /** The amount shown large on the card. */
  amountPaise: Paise;
  amountLabel: string;
  stats: DayCardStat[];
  action: 'Continue' | 'Got it';
}

export interface DayResultLike {
  budgetPaise: Paise;
  spentPaise: Paise;
}

/** Minutes since 00:00 in India time (the app's calendar). */
export function minutesOfDay(now: number): number {
  return Math.floor(((((now + IST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS) / MINUTE_MS);
}

/**
 * Which card is due right now, if any. From the night time on, only the night card (a first open
 * at 10 pm gets the night card, not a stale "good morning"); before it, the morning card.
 */
export function dueCard(args: {
  now: number;
  nightTime: { hour: number; minute: number };
  morningSeen: boolean;
  nightSeen: boolean;
}): DayCardKind | null {
  const night = args.nightTime.hour * 60 + args.nightTime.minute;
  if (minutesOfDay(args.now) >= night) return args.nightSeen ? null : 'night';
  return args.morningSeen ? null : 'morning';
}

/** Persistent once-per-day key for a card (stored in notification_log). */
export function cardKey(kind: DayCardKind, day: string): string {
  return `card:${kind}:${day}`;
}

function greeting(now: number): string {
  const m = minutesOfDay(now);
  if (m < 12 * 60) return 'Good morning';
  if (m < 17 * 60) return 'Good afternoon';
  return 'Good evening';
}

function daysText(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

export interface MorningCardInput {
  now: number;
  /** Today's carry-forward allowance. */
  todayAllowancePaise: Paise;
  /** Yesterday's allowance and what was really spent; null when there is nothing to compare. */
  yesterday: DayResultLike | null;
  /** Today is payday: a new cycle begins and nothing carries over from yesterday. */
  newCycle: boolean;
  /** Days until payday, today included. */
  daysLeft: number;
}

export function morningCard(input: MorningCardInput): DayCard {
  const today = formatINRWhole(input.todayAllowancePaise);
  const base = {
    kind: 'morning' as const,
    amountPaise: input.todayAllowancePaise,
    amountLabel: 'Safe to spend today',
    action: 'Continue' as const,
  };
  const daysLeftStat = { label: 'Until payday', value: daysText(input.daysLeft) };

  if (input.newCycle) {
    return {
      ...base,
      mood: 'celebrate',
      title: 'A new pay cycle starts today',
      message: `Fresh month, fresh plan. Your allowance today is ${today}.`,
      stats: [daysLeftStat],
    };
  }

  const y = input.yesterday;
  const yesterdayStats = y
    ? [
        { label: "Yesterday's allowance", value: formatINRWhole(y.budgetPaise) },
        { label: 'Spent yesterday', value: formatINRWhole(y.spentPaise) },
        daysLeftStat,
      ]
    : [daysLeftStat];

  if (input.todayAllowancePaise <= 0) {
    return {
      ...base,
      mood: 'resting',
      title: 'An easy day today',
      message:
        "This cycle's spending money is used up for now, so today's allowance is ₹0. Stick to essentials until payday. You've got this.",
      stats: yesterdayStats,
    };
  }

  if (!y) {
    return {
      ...base,
      mood: 'neutral',
      title: greeting(input.now),
      message: `Your allowance today is ${today}. Spend calmly; whatever you don't use carries forward.`,
      stats: yesterdayStats,
    };
  }

  const diff = y.budgetPaise - y.spentPaise;
  if (diff > 0) {
    return {
      ...base,
      mood: 'celebrate',
      title: 'You did great yesterday! 🎉',
      message: `You have ${formatINRWhole(diff)} extra from yesterday, shared across the days until payday. Your available allowance today is ${today}.`,
      stats: yesterdayStats,
    };
  }
  if (diff < 0) {
    return {
      ...base,
      mood: 'support',
      title: 'A fresh start today',
      message: `Yesterday you went ${formatINRWhole(-diff)} over your allowance. Don't worry! Your adjusted daily allowance is ${today} today.`,
      stats: yesterdayStats,
    };
  }
  return {
    ...base,
    mood: 'steady',
    title: 'Right on target yesterday',
    message: `You spent exactly your allowance. Your allowance today is ${today}.`,
    stats: yesterdayStats,
  };
}

export interface NightCardInput {
  /** Today's allowance and what has been spent today so far. */
  budgetPaise: Paise;
  spentPaise: Paise;
  /** The new daily average for the days after today; null when payday is tomorrow. */
  nextDaysAveragePaise: Paise | null;
}

export function nightCard(input: NightCardInput): DayCard {
  const left = input.budgetPaise - input.spentPaise;
  const ahead =
    input.nextDaysAveragePaise === null
      ? { label: 'Payday', value: 'Tomorrow' }
      : { label: 'From tomorrow', value: `${formatINRWhole(input.nextDaysAveragePaise)} a day` };
  const stats = [
    { label: 'Spent today', value: formatINRWhole(input.spentPaise) },
    { label: "Today's allowance", value: formatINRWhole(input.budgetPaise) },
    ahead,
  ];
  const base = { kind: 'night' as const, stats, action: 'Got it' as const };

  if (left > 0) {
    return {
      ...base,
      mood: 'celebrate',
      title: 'Great job managing your money!',
      message: `You still have ${formatINRWhole(left)} left from today's allowance. Whatever you don't spend carries forward to the days ahead.`,
      amountPaise: left,
      amountLabel: 'Left from today',
    };
  }
  if (left < 0) {
    const adjusted =
      input.nextDaysAveragePaise === null
        ? 'Payday is tomorrow, so a fresh cycle is close.'
        : `Your remaining budget has been adjusted to ${formatINRWhole(input.nextDaysAveragePaise)} a day until payday.`;
    return {
      ...base,
      mood: 'support',
      title: 'Today ran a little over',
      message: `You exceeded today's allowance by ${formatINRWhole(-left)}. ${adjusted}`,
      amountPaise: -left,
      amountLabel: 'Over today',
    };
  }
  if (input.budgetPaise <= 0) {
    return {
      ...base,
      mood: 'resting',
      title: 'Rest easy tonight',
      message: "Today's allowance was ₹0 while this cycle catches up. Every quiet day helps.",
      amountPaise: 0,
      amountLabel: 'Left from today',
    };
  }
  return {
    ...base,
    mood: 'steady',
    title: 'Right on your allowance',
    message: 'You spent exactly what today allowed. Your days ahead stay the same.',
    amountPaise: 0,
    amountLabel: 'Left from today',
  };
}
