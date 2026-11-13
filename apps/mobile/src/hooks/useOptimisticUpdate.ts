import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useToastStore } from '@/state/toastStore';

interface OptimisticUpdateOptions<T = unknown> {
  queryKey: QueryKey;
  updateFn: (oldData: T) => T;
  rollbackFn?: (oldData: T) => void;
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useOptimisticUpdate() {
  const queryClient = useQueryClient();
  const toast = useToastStore();

  const mutate = useCallback(
    async <T = unknown>(mutationFn: () => Promise<T>, options: OptimisticUpdateOptions<T>) => {
      const previousData = queryClient.getQueryData(options.queryKey) as T;

      // Optimistic update
      queryClient.setQueryData(options.queryKey, () => options.updateFn(previousData));

      try {
        const result = await mutationFn();

        if (options.successMessage) {
          toast.show(options.successMessage, 'success');
        }

        options.onSuccess?.();
        return result;
      } catch (error) {
        // Rollback on error
        if (options.rollbackFn) {
          options.rollbackFn(previousData);
        } else {
          queryClient.setQueryData(options.queryKey, previousData);
        }

        const errorMsg = error instanceof Error ? error.message : 'Something went wrong';
        toast.show(options.errorMessage || errorMsg, 'error');

        options.onError?.(error as Error);
        throw error;
      }
    },
    [queryClient, toast],
  );

  return { mutate };
}
