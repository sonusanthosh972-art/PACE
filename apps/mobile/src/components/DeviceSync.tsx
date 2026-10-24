import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import * as SmsReader from '../../modules/sms-reader';

import { refreshFromDevice } from '@/services/bootstrap';
import { subscribeToNewTransactions } from '@/services/liveEvents';
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
      }
    };

    refresh().catch(() => undefined);

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh().catch(() => undefined);
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
