import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import * as SmsReader from '../../modules/sms-reader';

import { refreshFromDevice } from '@/services/bootstrap';
import { subscribeToNewTransactions } from '@/services/liveEvents';
import { initNotifications, rescheduleAll } from '@/services/notifications';
import { syncNow } from '@/services/sync';
import { useAuthStore } from '@/state/authStore';
import { useImportStatus } from '@/state/importStatus';
import { invalidateAll } from '@/state/queries';

/**
 * Keeps the UI in step with the device: first-run SMS import, live bank SMS / payment
 * notifications while the app is open, and a refresh whenever the app returns to the foreground
 * (which also rolls the budget over at midnight).
 */
export function DeviceSync() {
  const client = useQueryClient();
  const setImporting = useImportStatus((s) => s.setImporting);
  const running = useRef(false);

  useEffect(() => {
    // Phase 6: set up notification channels, handler, and the live-alert hook.
    initNotifications().catch(() => undefined);
    // Phase 8: initialize auth store and trigger cloud sync if authenticated
    useAuthStore
      .getState()
      .init()
      .then(() => syncNow())
      .catch(() => undefined);

    const refresh = async () => {
      if (running.current) return;
      running.current = true;
      try {
        await refreshFromDevice(() => setImporting(true));
      } catch {
        // Ingest errors leave items queued natively; they are retried on the next refresh.
      } finally {
        running.current = false;
        setImporting(false);
        await invalidateAll(client);
        // Phase 6: recalculate scheduled notifications with fresh data after each sync.
        await rescheduleAll().catch(() => undefined);
        // Phase 8: sync freshly ingested transactions to server
        syncNow().catch(() => undefined);
      }
    };

    refresh().catch(() => undefined);

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh().catch(() => undefined);
        syncNow().catch(() => undefined);
      }
    });
    const pending = SmsReader.addPendingListener(() => {
      refresh().catch(() => undefined);
    });
    const unsubscribe = subscribeToNewTransactions(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      invalidateAll(client).catch(() => undefined);
    });

    return () => {
      appState.remove();
      pending?.remove();
      unsubscribe();
    };
  }, [client, setImporting]);

  return null;
}
