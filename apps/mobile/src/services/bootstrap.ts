import { Platform } from 'react-native';

import * as SmsReader from '../../modules/sms-reader';

import { getAppDb } from '@/data/appDb';
import { getSettings } from '@/data/settingsRepo';

import { systemClock } from './clock';
import { importRecentSms, ingestPending, type IngestSummary } from './ingest';
import { onNewTransactions } from './liveEvents';

export type SyncStatus = 'idle' | 'importing' | 'error';

/**
 * Pulls in everything the native layer has: the one-time 90-day import (first launch after
 * the SMS permission is granted), then anything queued by the live receivers.
 */
export async function refreshFromDevice(onImportStart?: () => void): Promise<IngestSummary | null> {
  if (Platform.OS !== 'android' || !SmsReader.isAvailable()) return null;
  const db = await getAppDb();
  const settings = await getSettings(db);
  if (!settings.onboardingComplete || settings.demoMode) return null;

  const permission = await SmsReader.getSmsPermissions();
  const inserted: IngestSummary['inserted'] = [];

  if (permission.granted && !settings.smsImportDone) {
    onImportStart?.();
    // Historical rows do not trigger live alerts; the caller refreshes the UI afterwards.
    const imported = await importRecentSms(db, SmsReader, systemClock);
    inserted.push(...imported.inserted);
  }

  const live = await ingestPending(db, SmsReader, systemClock);
  await onNewTransactions(db, live.inserted);
  return { ...live, inserted: [...inserted, ...live.inserted] };
}
