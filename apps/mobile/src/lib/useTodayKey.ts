import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { addDays, startOfDayMs, toDateKey, type DateKey } from '@/domain/time';

/** Today's IST date key, updated at midnight and when the app returns to the foreground. */
export function useTodayKey(): DateKey {
  const [today, setToday] = useState<DateKey>(() => toDateKey(Date.now()));

  useEffect(() => {
    const sync = () => setToday(toDateKey(Date.now()));
    const msToMidnight = startOfDayMs(addDays(today, 1)) - Date.now();
    const timer = setTimeout(sync, Math.max(1000, msToMidnight + 1000));
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [today]);

  return today;
}
