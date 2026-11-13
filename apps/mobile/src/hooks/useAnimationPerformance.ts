import { useCallback, useEffect, useRef } from 'react';

interface PerformanceMetrics {
  fps: number;
  droppedFrames: number;
  avgFrameTime: number;
}

export function useAnimationPerformance(enabled = __DEV__) {
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const metricsRef = useRef<PerformanceMetrics>({
    fps: 60,
    droppedFrames: 0,
    avgFrameTime: 0,
  });

  const recordFrame = useCallback(
    (currentTime: number = Date.now()) => {
      if (!enabled) return;

      frameCountRef.current += 1;
      const frameDuration = currentTime - (lastTimeRef.current || currentTime);

      frameTimesRef.current.push(frameDuration);

      // Keep last 60 frames for moving average
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift();
      }

      // Calculate metrics every second
      const elapsed = currentTime - lastTimeRef.current;
      if (elapsed >= 1000) {
        const fps = frameCountRef.current;
        const avgFrameTime =
          frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
        const droppedFrames = frameTimesRef.current.filter((t) => t > 16.67).length; // 60fps = 16.67ms per frame

        metricsRef.current = {
          fps,
          droppedFrames,
          avgFrameTime: Math.round(avgFrameTime * 100) / 100,
        };

        if (__DEV__) {
          console.log(
            `[Animation Performance] FPS: ${fps}, Dropped: ${droppedFrames}, Avg: ${avgFrameTime.toFixed(2)}ms`,
          );
        }

        frameCountRef.current = 0;
        lastTimeRef.current = currentTime;
      }
    },
    [enabled],
  );

  const getMetrics = () => metricsRef.current;

  useEffect(() => {
    if (!enabled) return;

    let animationId: number;
    const measureFrame: FrameRequestCallback = (timestamp: number) => {
      recordFrame(timestamp);
      animationId = requestAnimationFrame(measureFrame);
    };

    animationId = requestAnimationFrame(measureFrame);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [enabled, recordFrame]);

  return { getMetrics, recordFrame };
}

/**
 * Hook for monitoring a specific animation's performance
 */
export function useAnimationMonitor(animationName: string) {
  const startTimeRef = useRef<number | undefined>(undefined);
  const samplesRef = useRef<number[]>([]);

  const start = () => {
    startTimeRef.current = performance.now();
  };

  const end = () => {
    if (startTimeRef.current) {
      const duration = performance.now() - startTimeRef.current;
      samplesRef.current.push(duration);

      if (samplesRef.current.length > 100) {
        samplesRef.current.shift();
      }

      if (__DEV__) {
        const avg = samplesRef.current.reduce((a, b) => a + b, 0) / samplesRef.current.length;
        console.log(
          `[${animationName}] Duration: ${duration.toFixed(2)}ms, Avg: ${avg.toFixed(2)}ms`,
        );
      }
    }
  };

  const getSamples = () => samplesRef.current;

  return { start, end, getSamples };
}
