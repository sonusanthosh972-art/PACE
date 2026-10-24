import { AppRegistry } from 'react-native';

import * as SmsReader from '../../modules/sms-reader';

import { getAppDb } from '@/data/appDb';

import { systemClock } from './clock';
import { ingestPending } from './ingest';
import { onNewTransactions } from './liveEvents';

/**
 * Runs when a bank SMS / payment notification arrives while the app is closed:
 * native code queues the item and starts this task; we parse, store and notify.
 */
async function headlessIngest(): Promise<void> {
  const db = await getAppDb();
  const summary = await ingestPending(db, SmsReader, systemClock);
  await onNewTransactions(db, summary.inserted);
}

export function registerHeadlessIngest(): void {
  AppRegistry.registerHeadlessTask(SmsReader.HEADLESS_TASK_NAME, () => headlessIngest);
}
