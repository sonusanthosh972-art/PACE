import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getTimeOfDay, msUntilNextTimeOfDay, type TimeOfDay } from '@/domain/timeOfDay';

/**
 * The current time of day, updated exactly when the next period starts and when the app returns
 * to the foreground. One timer, no polling.
 */
export function useTimeOfDay(): TimeOfDay {
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(() => getTimeOfDay());

  useEffect(() => {
    const sync = () => setTimeOfDay(getTimeOfDay());
    // +1 s so the timer never fires a moment before the boundary.
    const timer = setTimeout(sync, msUntilNextTimeOfDay() + 1000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [timeOfDay]);

  return timeOfDay;
}
