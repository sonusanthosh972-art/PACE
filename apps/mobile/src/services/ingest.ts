import type { PendingItem } from '../../modules/sms-reader';

import type { SqlDb } from '@/data/db';
import { setSetting } from '@/data/settingsRepo';
import { ingestParsed, isDeleted, type Clock } from '@/data/transactionsRepo';
import { computeDedupeHash } from '@/domain/dedupe';
import { parseNotification, parseSms } from '@/domain/parsing/parseSms';
import { DAY_MS } from '@/domain/time';
import type { Transaction } from '@/domain/transaction';

export const IMPORT_WINDOW_DAYS = 90;

export interface IngestSummary {
  inserted: Transaction[];
  merged: number;
  duplicates: number;
  ignored: number;
}

function parseItem(item: PendingItem) {
  return item.kind === 'sms'
    ? parseSms(item.sender, item.body, item.receivedAt)
    : parseNotification(item.packageName, item.title, item.text, item.postedAt);
}

/**
 * Parses raw SMS/notification items and stores the resulting transactions.
 * Raw text is used only in memory here; only parsed fields are persisted.
 */
export async function ingestItems(
  db: SqlDb,
  items: readonly PendingItem[],
  clock: Clock,
): Promise<IngestSummary> {
  // One ingest at a time: the headless task and the foreground app can both be draining.
  const run = ingestQueue.then(() => ingestItemsNow(db, items, clock));
  ingestQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

let ingestQueue: Promise<void> = Promise.resolve();

async function ingestItemsNow(
  db: SqlDb,
  items: readonly PendingItem[],
  clock: Clock,
): Promise<IngestSummary> {
  const summary: IngestSummary = { inserted: [], merged: 0, duplicates: 0, ignored: 0 };
  if (items.length === 0) return summary;

  const ordered = [...items].sort(
    (a, b) =>
      (a.kind === 'sms' ? a.receivedAt : a.postedAt) -
      (b.kind === 'sms' ? b.receivedAt : b.postedAt),
  );

  await db.withTransactionAsync(async () => {
    for (const item of ordered) {
      // A message the parser chokes on is skipped; it must not cancel the rest of the batch.
      let parsed: ReturnType<typeof parseItem> = null;
      try {
        parsed = parseItem(item);
      } catch {
        parsed = null;
      }
      // Deleted by the user: a late duplicate SMS/notification must not bring it back.
      if (!parsed || (await isDeleted(db, computeDedupeHash(parsed)))) {
        summary.ignored += 1;
        continue;
      }
      const result = await ingestParsed(db, parsed, clock);
      if (result.status === 'inserted') summary.inserted.push(result.transaction);
      else if (result.status === 'merged') summary.merged += 1;
      else summary.duplicates += 1;
    }
  });
  return summary;
}

export interface SmsSource {
  readBankSms(sinceMs: number): Promise<PendingItem[]>;
  /** Live queued items; they stay queued until `ackPending`. */
  peekPending(): Promise<PendingItem[]>;
  ackPending(upToSeq: number): Promise<void>;
}

/** First-launch import of the last 90 days of bank SMS. */
export async function importRecentSms(
  db: SqlDb,
  source: SmsSource,
  clock: Clock,
): Promise<IngestSummary> {
  const since = clock.now() - IMPORT_WINDOW_DAYS * DAY_MS;
  const summary = await ingestItems(db, await source.readBankSms(since), clock);
  await setSetting(db, 'smsImportDone', true);
  return summary;
}

/**
 * Stores whatever the native receivers queued (live SMS / notifications), then removes them from
 * the queue. If storing fails or the app is killed first, they stay queued for the next run.
 */
export async function ingestPending(
  db: SqlDb,
  source: SmsSource,
  clock: Clock,
): Promise<IngestSummary> {
  const items = await source.peekPending();
  const summary = await ingestItems(db, items, clock);
  const lastSeq = Math.max(-1, ...items.map((i) => i.queueSeq ?? -1));
  if (lastSeq >= 0) await source.ackPending(lastSeq);
  return summary;
}
