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

/**
 * Counts from 1 up to `total`, one step per frame. A page with several heavy cards can mount them
 * one per frame instead of all in one long frame that stalls the screen.
 */
export function useProgressiveCount(total: number): number {
  const [count, setCount] = useState(1);
  useEffect(() => {
    if (count >= total) return;
    const frame = requestAnimationFrame(() => setCount((c) => Math.min(total, c + 1)));
    return () => cancelAnimationFrame(frame);
  }, [count, total]);
  return Math.min(count, total);
}
