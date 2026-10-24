import { categorise, type UserRule } from '@/domain/categorise';
import { isCategoryId, type CategoryId } from '@/domain/categories';
import {
  computeDedupeHash,
  DEDUPE_WINDOW_MS,
  findDuplicate,
  manualDedupeHash,
} from '@/domain/dedupe';
import { normaliseMerchant } from '@/domain/merchant';
import {
  transactionSchema,
  type Mode,
  type ParsedTransaction,
  type Transaction,
} from '@/domain/transaction';

import type { SqlDb, SqlValue } from './db';

export interface TxRow {
  id: string;
  amount_paise: number;
  direction: string;
  account_last4: string | null;
  merchant: string | null;
  merchant_norm: string;
  vpa: string | null;
  mode: string;
  upi_ref: string | null;
  balance_paise: number | null;
  category: string;
  needs_review: number;
  note: string | null;
  source: string;
  occurred_at: number;
  dedupe_hash: string;
  is_excluded: number;
  created_at: number;
  updated_at: number;
  sync_state: string;
}

/** Validates a DB row into a Transaction; rows that fail validation are dropped (and reported). */
export function rowToTransaction(row: TxRow): Transaction | null {
  const parsed = transactionSchema.safeParse({
    id: row.id,
    amountPaise: row.amount_paise,
    direction: row.direction,
    accountLast4: row.account_last4,
    merchant: row.merchant,
    merchantNorm: row.merchant_norm,
    vpa: row.vpa,
    mode: row.mode,
    upiRef: row.upi_ref,
    balancePaise: row.balance_paise,
    category: row.category,
    needsReview: row.needs_review === 1,
    note: row.note,
    source: row.source,
    occurredAt: row.occurred_at,
    dedupeHash: row.dedupe_hash,
    isExcluded: row.is_excluded === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  return parsed.success ? parsed.data : null;
}

function rowsToTransactions(rows: readonly TxRow[]): Transaction[] {
  const out: Transaction[] = [];
  for (const row of rows) {
    const tx = rowToTransaction(row);
    if (tx) out.push(tx);
  }
  return out;
}

const INSERT_SQL = `INSERT INTO transactions (
  id, amount_paise, direction, account_last4, merchant, merchant_norm, vpa, mode, upi_ref,
  balance_paise, category, needs_review, note, source, occurred_at, dedupe_hash, is_excluded,
  created_at, updated_at, sync_state
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;

async function insert(db: SqlDb, tx: Transaction): Promise<void> {
  await db.runAsync(INSERT_SQL, [
    tx.id,
    tx.amountPaise,
    tx.direction,
    tx.accountLast4,
    tx.merchant,
    tx.merchantNorm,
    tx.vpa,
    tx.mode,
    tx.upiRef,
    tx.balancePaise,
    tx.category,
    tx.needsReview ? 1 : 0,
    tx.note,
    tx.source,
    tx.occurredAt,
    tx.dedupeHash,
    tx.isExcluded ? 1 : 0,
    tx.createdAt,
    tx.updatedAt,
  ]);
}

export async function getRules(db: SqlDb): Promise<UserRule[]> {
  const rows = await db.getAllAsync<{
    id: string;
    pattern: string;
    category: string;
    created_at: number;
  }>('SELECT id, pattern, category, created_at FROM user_rules', []);
  return rows.flatMap((r) =>
    isCategoryId(r.category)
      ? [{ id: r.id, pattern: r.pattern, category: r.category, createdAt: r.created_at }]
      : [],
  );
}

export async function getById(db: SqlDb, id: string): Promise<Transaction | null> {
  const row = await db.getFirstAsync<TxRow>('SELECT * FROM transactions WHERE id = ?', [id]);
  return row ? rowToTransaction(row) : null;
}

export type IngestResult =
  | { status: 'inserted'; transaction: Transaction }
  | { status: 'merged'; transaction: Transaction }
  | { status: 'duplicate'; transaction: Transaction };

export interface Clock {
  now(): number;
  newId(): string;
}

/**
 * Stores a parsed SMS/notification transaction, deduplicating against what is already stored:
 * exact dedupeHash → duplicate; otherwise a ±3 min window match → merged (missing fields such as
 * upiRef / last4 / balance are filled in on the existing row).
 */
export async function ingestParsed(
  db: SqlDb,
  parsed: ParsedTransaction,
  clock: Clock,
): Promise<IngestResult> {
  const merchantNorm = normaliseMerchant(parsed.merchant, parsed.vpa);
  const dedupeHash = computeDedupeHash(parsed);

  const exact = await db.getFirstAsync<TxRow>('SELECT * FROM transactions WHERE dedupe_hash = ?', [
    dedupeHash,
  ]);
  const exactTx = exact ? rowToTransaction(exact) : null;
  if (exactTx) return { status: 'duplicate', transaction: exactTx };

  const nearbyRows = await db.getAllAsync<TxRow>(
    `SELECT * FROM transactions
     WHERE amount_paise = ? AND occurred_at BETWEEN ? AND ? AND source != 'manual'`,
    [
      parsed.amountPaise,
      parsed.occurredAt - DEDUPE_WINDOW_MS,
      parsed.occurredAt + DEDUPE_WINDOW_MS,
    ],
  );
  const nearby = rowsToTransactions(nearbyRows);
  if (parsed.upiRef) {
    // A row with the same reference may exist under an amount/time hash (e.g. notification first).
    const sameRef = await db.getAllAsync<TxRow>('SELECT * FROM transactions WHERE upi_ref = ?', [
      parsed.upiRef,
    ]);
    nearby.push(...rowsToTransactions(sameRef));
  }

  const match = findDuplicate({ ...parsed, merchantNorm }, nearby);
  if (match) {
    const now = clock.now();
    const merged: Transaction = {
      ...match,
      upiRef: match.upiRef ?? parsed.upiRef,
      accountLast4: match.accountLast4 ?? parsed.accountLast4,
      balancePaise: match.balancePaise ?? parsed.balancePaise,
      vpa: match.vpa ?? parsed.vpa,
      merchant: match.merchant ?? parsed.merchant,
      merchantNorm: match.merchantNorm || merchantNorm,
      updatedAt: now,
    };
    const changed =
      merged.upiRef !== match.upiRef ||
      merged.accountLast4 !== match.accountLast4 ||
      merged.balancePaise !== match.balancePaise ||
      merged.vpa !== match.vpa ||
      merged.merchant !== match.merchant;
    if (!changed) return { status: 'duplicate', transaction: match };

    await db.runAsync(
      `UPDATE transactions SET upi_ref = ?, account_last4 = ?, balance_paise = ?, vpa = ?, merchant = ?,
         merchant_norm = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
      [
        merged.upiRef,
        merged.accountLast4,
        merged.balancePaise,
        merged.vpa,
        merged.merchant,
        merged.merchantNorm,
        now,
        match.id,
      ],
    );
    return { status: 'merged', transaction: merged };
  }

  const rules = await getRules(db);
  const { category, needsReview } = categorise(
    { merchantNorm, vpa: parsed.vpa, mode: parsed.mode, direction: parsed.direction },
    rules,
  );
  const now = clock.now();
  const tx = transactionSchema.parse({
    ...parsed,
    id: clock.newId(),
    merchantNorm,
    category,
    needsReview,
    note: null,
    dedupeHash,
    isExcluded: false,
    createdAt: now,
    updatedAt: now,
  });
  await insert(db, tx);
  return { status: 'inserted', transaction: tx };
}

export interface ManualEntry {
  amountPaise: number;
  category: CategoryId;
  note: string | null;
  merchant: string | null;
  occurredAt: number;
  mode?: Mode;
}

export async function addManual(db: SqlDb, entry: ManualEntry, clock: Clock): Promise<Transaction> {
  const id = clock.newId();
  const now = clock.now();
  const merchant = entry.merchant?.trim() || null;
  const tx = transactionSchema.parse({
    id,
    amountPaise: entry.amountPaise,
    direction: 'debit',
    accountLast4: null,
    merchant,
    merchantNorm: normaliseMerchant(merchant, null),
    vpa: null,
    mode: entry.mode ?? 'OTHER',
    upiRef: null,
    balancePaise: null,
    occurredAt: entry.occurredAt,
    source: 'manual',
    category: entry.category,
    needsReview: false,
    note: entry.note?.trim() || null,
    dedupeHash: manualDedupeHash(id),
    isExcluded: false,
    createdAt: now,
    updatedAt: now,
  });
  await insert(db, tx);
  return tx;
}

export interface TxFilter {
  from?: number;
  to?: number;
  category?: CategoryId;
  mode?: Mode;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listTransactions(db: SqlDb, filter: TxFilter = {}): Promise<Transaction[]> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (filter.from !== undefined) {
    where.push('occurred_at >= ?');
    params.push(filter.from);
  }
  if (filter.to !== undefined) {
    where.push('occurred_at < ?');
    params.push(filter.to);
  }
  if (filter.category) {
    where.push('category = ?');
    params.push(filter.category);
  }
  if (filter.mode) {
    where.push('mode = ?');
    params.push(filter.mode);
  }
  const search = filter.search?.trim().toLowerCase();
  if (search) {
    where.push(
      "(merchant_norm LIKE ? ESCAPE '\\' OR LOWER(COALESCE(note, '')) LIKE ? ESCAPE '\\')",
    );
    const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    params.push(like, like);
  }
  const sql = `SELECT * FROM transactions ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY occurred_at DESC LIMIT ? OFFSET ?`;
  params.push(filter.limit ?? 500, filter.offset ?? 0);
  return rowsToTransactions(await db.getAllAsync<TxRow>(sql, params));
}

/**
 * Re-categorises a transaction and records the choice as a user rule, so future (and existing)
 * transactions from the same merchant get the same category.
 */
export async function recategorise(
  db: SqlDb,
  id: string,
  category: CategoryId,
  clock: Clock,
): Promise<number> {
  const tx = await getById(db, id);
  if (!tx) return 0;
  const now = clock.now();
  let changed = 0;
  await db.withTransactionAsync(async () => {
    if (tx.merchantNorm) {
      await db.runAsync(
        `INSERT INTO user_rules (id, pattern, category, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(pattern) DO UPDATE SET category = excluded.category, created_at = excluded.created_at`,
        [clock.newId(), tx.merchantNorm, category, now],
      );
      const res = await db.runAsync(
        `UPDATE transactions SET category = ?, needs_review = 0, updated_at = ?, sync_state = 'pending'
         WHERE merchant_norm = ?`,
        [category, now, tx.merchantNorm],
      );
      changed = res.changes;
    } else {
      const res = await db.runAsync(
        `UPDATE transactions SET category = ?, needs_review = 0, updated_at = ?, sync_state = 'pending'
         WHERE id = ?`,
        [category, now, id],
      );
      changed = res.changes;
    }
  });
  return changed;
}

/** "Not an expense" (e.g. a transfer to your own account) — excluded from all spend maths. */
export async function setExcluded(
  db: SqlDb,
  id: string,
  excluded: boolean,
  clock: Clock,
): Promise<void> {
  await db.runAsync(
    `UPDATE transactions SET is_excluded = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
    [excluded ? 1 : 0, clock.now(), id],
  );
}

export async function deleteTransaction(db: SqlDb, id: string): Promise<void> {
  await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
}

export async function pendingSync(db: SqlDb, limit = 200): Promise<Transaction[]> {
  return rowsToTransactions(
    await db.getAllAsync<TxRow>(
      `SELECT * FROM transactions WHERE sync_state = 'pending' ORDER BY updated_at LIMIT ?`,
      [limit],
    ),
  );
}

/** Marks rows synced only if they have not changed since they were sent. */
export async function markSynced(
  db: SqlDb,
  items: readonly { id: string; updatedAt: number }[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const item of items) {
      await db.runAsync(
        `UPDATE transactions SET sync_state = 'synced' WHERE id = ? AND updated_at = ?`,
        [item.id, item.updatedAt],
      );
    }
  });
}

export async function countTransactions(db: SqlDb): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions', []);
  return row?.n ?? 0;
}
