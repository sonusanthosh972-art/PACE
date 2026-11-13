import { useCallback, useRef, useState } from 'react';

export interface RetryConfig {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

export function useRetry(config: RetryConfig = {}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const retry = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      const finalConfig = { ...DEFAULT_CONFIG, ...config };
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error as Error;

          if (attempt < finalConfig.maxRetries) {
            const delay = Math.min(
              finalConfig.initialDelay * Math.pow(finalConfig.backoffMultiplier, attempt),
              finalConfig.maxDelay,
            );

            setRetryCount(attempt + 1);
            setIsRetrying(true);

            await new Promise((resolve) => {
              timeoutRef.current = setTimeout(resolve, delay);
            });
          }
        }
      }

      setIsRetrying(false);
      setRetryCount(0);
      throw lastError;
    },
    [config],
  );

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsRetrying(false);
    setRetryCount(0);
  }, []);

  return { retry, isRetrying, retryCount, cancel };
}
