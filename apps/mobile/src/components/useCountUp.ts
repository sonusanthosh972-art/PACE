import { useEffect, useRef, useState } from 'react';

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Rolls a number from its previous value to `target` (first render starts at 0).
 * Returns `target` directly when `animate` is false (Reduce motion / tests).
 */
export function useCountUp(target: number, { durationMs = 650, animate = true } = {}): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!animate) return;
    const from = fromRef.current;
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const next = Math.round(from + (target - from) * easeOutCubic(t));
      fromRef.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, animate, durationMs]);

  return animate ? value : target;
}
