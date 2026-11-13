import { useEffect, useRef } from 'react';

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface PerformanceMetrics {
  metrics: PerformanceMetric[];
  totalCount: number;
  averageDuration: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private marksRef: Map<string, number> = new Map();
  private maxMetrics = 1000;

  mark(name: string, metadata?: Record<string, unknown>) {
    this.marksRef.set(name, performance.now());
  }

  measure(
    name: string,
    startMark: string,
    metadata?: Record<string, unknown>,
  ): PerformanceMetric | null {
    const startTime = this.marksRef.get(startMark);
    if (!startTime) {
      console.warn(`[Performance] Start mark "${startMark}" not found`);
      return null;
    }

    const duration = performance.now() - startTime;
    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: Date.now(),
      metadata,
    };

    this.metrics.push(metric);

    // Keep only last N metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    if (__DEV__) {
      console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
    }

    return metric;
  }

  getMetrics(filter?: string): PerformanceMetrics {
    const filtered = filter ? this.metrics.filter((m) => m.name.includes(filter)) : this.metrics;

    const totalDuration = filtered.reduce((sum, m) => sum + m.duration, 0);
    const averageDuration = filtered.length > 0 ? totalDuration / filtered.length : 0;

    return {
      metrics: filtered,
      totalCount: filtered.length,
      averageDuration: Math.round(averageDuration * 100) / 100,
    };
  }

  clearMetrics() {
    this.metrics = [];
    this.marksRef.clear();
  }

  getSlowMetrics(threshold: number = 100): PerformanceMetric[] {
    return this.metrics.filter((m) => m.duration > threshold);
  }

  exportMetrics(): string {
    return JSON.stringify(this.metrics, null, 2);
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Hook for performance monitoring
export function usePerformanceMetrics(operationName: string) {
  const startMarkRef = useRef<string>('');

  const start = () => {
    startMarkRef.current = `${operationName}-start-${Date.now()}`;
    performanceMonitor.mark(startMarkRef.current);
  };

  const end = (metadata?: Record<string, unknown>) => {
    if (startMarkRef.current) {
      performanceMonitor.measure(`${operationName}`, startMarkRef.current, metadata);
    }
  };

  return { start, end };
}

// Hook for tracking render performance
export function useRenderMetrics(componentName: string) {
  const renderCountRef = useRef(0);
  const renderTimesRef = useRef<number[]>([]);
  const lastRenderRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (lastRenderRef.current === 0) {
      lastRenderRef.current = now;
    }
    const timeSinceLastRender = now - lastRenderRef.current;

    renderCountRef.current += 1;
    renderTimesRef.current.push(timeSinceLastRender);

    // Keep last 50 renders
    if (renderTimesRef.current.length > 50) {
      renderTimesRef.current.shift();
    }

    lastRenderRef.current = now;

    if (__DEV__ && renderCountRef.current % 10 === 0) {
      const avgTime =
        renderTimesRef.current.reduce((a, b) => a + b, 0) / renderTimesRef.current.length;
      const maxTime = Math.max(...renderTimesRef.current);
      console.log(
        `[Render] ${componentName}: renders=${renderCountRef.current}, avg=${avgTime.toFixed(2)}ms, max=${maxTime}ms`,
      );
    }
  });

  return { getRenderCount: () => renderCountRef.current };
}

// Hook for memory leak detection
export function useMemoryMonitoring() {
  useEffect(() => {
    if (!__DEV__) return;

    const checkMemory = () => {
      // Note: Memory API is limited on React Native
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perfMemory = performance as Record<string, any>;
      if (perfMemory.memory) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const used = (perfMemory.memory as any).usedJSHeapSize;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const limit = (perfMemory.memory as any).jsHeapSizeLimit;
        const percentage = (used / limit) * 100;

        if (percentage > 80) {
          console.warn(`[Memory] High memory usage: ${percentage.toFixed(2)}%`);
        }
      }
    };

    const interval: NodeJS.Timeout = setInterval(checkMemory, 5000);
    return () => clearInterval(interval);
  }, []);
}
