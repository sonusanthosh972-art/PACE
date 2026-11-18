import { useEffect, useState } from 'react';

import { MOTION } from '@/theme/tokens';

/**
 * False on a screen's first render, true once its opening transition has finished. Lets a page
 * show its header and light content immediately and mount heavy parts (charts, long lists) a
 * moment later, so building them never competes with the slide animation.
 */
export function useAfterTransition(delayMs: number = MOTION.tabMs + 40): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDone(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return done;
}
