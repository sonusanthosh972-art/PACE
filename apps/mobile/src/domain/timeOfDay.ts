import type { ImageSourcePropType } from 'react-native';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * Resolves the 4 environmental time states based on local 24-hour time:
 * - 05:00 – 10:59: Morning (Sunrise)
 * - 11:00 – 15:59: Afternoon (Daytime)
 * - 16:00 – 18:59: Evening (Sunset / Golden hour)
 * - 19:00 – 04:59: Night (Moonlit / Stars)
 */
export function getTimeOfDay(now: Date = new Date()): TimeOfDay {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'afternoon';
  if (hour >= 16 && hour < 19) return 'evening';
  return 'night';
}

/** "Good afternoon, Sonu": the headline greeting. Uses the first name only, when known. */
export function getGreetingTitle(timeOfDay: TimeOfDay, name?: string | null): string {
  const hello =
    timeOfDay === 'morning'
      ? 'Good morning'
      : timeOfDay === 'afternoon'
        ? 'Good afternoon'
        : 'Good evening';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${hello}, ${first}` : hello;
}

/** Local hours at which a new period starts, in order through the day. */
const BOUNDARY_HOURS = [5, 11, 16, 19] as const;

/** Milliseconds until the next period starts (always > 0), so a timer can switch exactly then. */
export function msUntilNextTimeOfDay(now: Date = new Date()): number {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  const hour = BOUNDARY_HOURS.find((h) => h > now.getHours());
  if (hour === undefined) {
    next.setDate(next.getDate() + 1);
    next.setHours(BOUNDARY_HOURS[0]);
  } else {
    next.setHours(hour);
  }
  return next.getTime() - now.getTime();
}

/**
 * Contextual greeting matching the time of day.
 */
export function getGreeting(timeOfDay: TimeOfDay): string {
  switch (timeOfDay) {
    case 'morning':
      return 'Good morning · Today';
    case 'afternoon':
      return 'Good afternoon · Today';
    case 'evening':
      return 'Good evening · Today';
    case 'night':
      return 'Good evening · Tonight';
  }
}

/** Width ÷ height of the bundled backgrounds (1086 × 1000, skyline in the upper half). */
export const TIME_BACKGROUND_ASPECT = 1086 / 1000;

/**
 * Returns the bundled local image asset for the active time of day.
 */
export function getTimeBackgroundAsset(timeOfDay: TimeOfDay): ImageSourcePropType {
  switch (timeOfDay) {
    case 'morning':
      return require('../../assets/Bg/morning.jpg');
    case 'afternoon':
      return require('../../assets/Bg/afternoon.jpg');
    case 'evening':
      return require('../../assets/Bg/evening.jpg');
    case 'night':
      return require('../../assets/Bg/night.jpg');
  }
}
