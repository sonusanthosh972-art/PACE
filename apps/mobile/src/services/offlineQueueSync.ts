import { useOfflineQueueStore } from '@/state/offlineQueueStore';
import { useToastStore } from '@/state/toastStore';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useRetry } from '@/hooks/useRetry';
import { useEffect } from 'react';

export function useOfflineQueueSync() {
  const network = useNetworkStatus();
  const queue = useOfflineQueueStore((s) => s.queue);
  const remove = useOfflineQueueStore((s) => s.remove);
  const updateStatus = useOfflineQueueStore((s) => s.updateStatus);
  const incrementRetries = useOfflineQueueStore((s) => s.incrementRetries);
  const toast = useToastStore();
  const { retry } = useRetry({ maxRetries: 3, initialDelay: 2000 });

  useEffect(() => {
    if (!network.isConnected || network.isInternetReachable === false || queue.length === 0) {
      return;
    }

    const syncQueue = async () => {
      for (const transaction of queue) {
        if (transaction.status !== 'pending') continue;

        try {
          await retry(async () => {
            // TODO: Process the queued transaction based on its type
            // For now, this is a placeholder
            return Promise.resolve();
          });

          remove(transaction.id);
          toast.show('Offline changes synced', 'success');
        } catch {
          incrementRetries(transaction.id);
          if (transaction.retries >= 3) {
            updateStatus(transaction.id, 'failed');
            toast.show('Failed to sync. Will retry later.', 'warning', 5000);
          }
        }
      }
    };

    syncQueue().catch(console.error);
  }, [
    network.isConnected,
    network.isInternetReachable,
    queue,
    retry,
    remove,
    updateStatus,
    incrementRetries,
    toast,
  ]);

  return { queue, isOnline: network.isConnected };
}

/**
 * Processor function that handles executing queued transactions.
 * Call this from your mutation functions when offline.
 */
export async function processQueuedTransaction(transaction: unknown): Promise<void> {
  const { add } = useOfflineQueueStore.getState();

  // Queue for later sync
  add({
    type: 'add',
    payload: transaction,
  });
}
