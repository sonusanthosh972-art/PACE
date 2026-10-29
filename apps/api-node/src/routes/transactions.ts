import { Router, Response } from 'express';
import { z } from 'zod';
import type { AnyBulkWriteOperation, Filter } from 'mongodb';
import { AuthenticatedRequest, requireAuth, userIdOf } from '../middleware/auth.js';
import { getDb } from '../db/mongo.js';
import { TransactionDoc } from '../db/models.js';
import { CATEGORY_IDS, DIRECTIONS, MODES, SOURCES } from '../domain.js';
import { problem, validationProblem } from '../http.js';

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

export const MAX_SYNC_BATCH = 500;

const paise = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Parsed fields only (same shape as the mobile transaction schema); raw SMS text is never accepted. */
const transactionInputSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    amountPaise: paise.positive(),
    direction: z.enum(DIRECTIONS),
    merchant: optionalText(120),
    merchantNorm: optionalText(120),
    vpa: optionalText(120),
    mode: z.enum(MODES),
    accountLast4: z.string().regex(/^\d{3,4}$/).nullable().optional(),
    upiRef: z.string().regex(/^\d{6,22}$/).nullable().optional(),
    balancePaise: paise.nullable().optional(),
    category: z.enum(CATEGORY_IDS),
    needsReview: z.boolean().default(false),
    note: optionalText(280),
    source: z.enum(SOURCES),
    occurredAt: z.number().int().positive(),
    dedupeHash: z.string().regex(/^[0-9a-f]{64}$/),
    isExcluded: z.boolean().default(false),
    createdAt: z.number().int().positive().optional(),
    updatedAt: z.number().int().positive().optional(),
  })
  .strict();

const syncSchema = z.object({
  transactions: z.array(transactionInputSchema).max(MAX_SYNC_BATCH),
});

const deleteSchema = z.object({
  dedupeHashes: z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(MAX_SYNC_BATCH),
});

const patchSchema = z
  .object({
    category: z.enum(CATEGORY_IDS).optional(),
    isExcluded: z.boolean().optional(),
    note: optionalText(280),
  })
  .strict();

const listQuerySchema = z.object({
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  category: z.enum(CATEGORY_IDS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Never return Mongo's _id or the owner id to clients. */
const PUBLIC_PROJECTION = { _id: 0, userId: 0 } as const;

// POST /api/v1/transactions/sync — idempotent on (userId, dedupeHash)
transactionsRouter.post('/sync', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parse = syncSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }

  const userId = userIdOf(req);
  const nowMs = Date.now();
  if (parse.data.transactions.length === 0) {
    res.status(200).json({ inserted: 0, updated: 0, totalProcessed: 0 });
    return;
  }

  // Keep the last copy of each payment: two upserts for one key in a parallel batch would collide.
  const unique = [...new Map(parse.data.transactions.map((t) => [t.dedupeHash, t])).values()];

  // One round trip for the whole batch instead of one per transaction.
  const ops: AnyBulkWriteOperation<TransactionDoc>[] = unique.map((t) => ({
    updateOne: {
      filter: { userId, dedupeHash: t.dedupeHash },
      update: {
        $setOnInsert: {
          id: t.id,
          userId,
          dedupeHash: t.dedupeHash,
          occurredAt: t.occurredAt,
          amountPaise: t.amountPaise,
          direction: t.direction,
          mode: t.mode,
          source: t.source,
          createdAt: t.createdAt ?? nowMs,
        },
        $set: {
          category: t.category,
          needsReview: t.needsReview,
          note: t.note || null,
          isExcluded: t.isExcluded,
          merchant: t.merchant || null,
          merchantNorm: t.merchantNorm || null,
          vpa: t.vpa || null,
          accountLast4: t.accountLast4 ?? null,
          upiRef: t.upiRef ?? null,
          balancePaise: t.balancePaise ?? null,
          updatedAt: t.updatedAt ?? nowMs,
        },
      },
      upsert: true,
    },
  }));
  const result = await getDb()
    .collection<TransactionDoc>('transactions')
    .bulkWrite(ops, { ordered: false });

  res.status(200).json({
    inserted: result.upsertedCount,
    updated: result.matchedCount,
    totalProcessed: parse.data.transactions.length,
  });
});

// POST /api/v1/transactions/delete — payments the user deleted on the phone (idempotent)
transactionsRouter.post('/delete', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parse = deleteSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }
  const result = await getDb()
    .collection<TransactionDoc>('transactions')
    .deleteMany({ userId: userIdOf(req), dedupeHash: { $in: parse.data.dedupeHashes } });
  res.status(200).json({ deleted: result.deletedCount });
});

// GET /api/v1/transactions?from&to&category&page&pageSize
transactionsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parse = listQuerySchema.safeParse(req.query);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }
  const { from, to, category, page, pageSize } = parse.data;

  const filter: Filter<TransactionDoc> = { userId: userIdOf(req) };
  if (from !== undefined || to !== undefined) {
    filter.occurredAt = {
      ...(from !== undefined ? { $gte: from } : {}),
      ...(to !== undefined ? { $lte: to } : {}),
    };
  }
  if (category) filter.category = category;

  const collection = getDb().collection<TransactionDoc>('transactions');
  const [totalCount, items] = await Promise.all([
    collection.countDocuments(filter),
    collection
      .find(filter, { projection: PUBLIC_PROJECTION })
      .sort({ occurredAt: -1, id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
  ]);

  res.status(200).json({
    items,
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  });
});

// PATCH /api/v1/transactions/:id
transactionsRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parse = patchSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }

  const set: Partial<TransactionDoc> = { updatedAt: Date.now() };
  if (parse.data.category !== undefined) set.category = parse.data.category;
  if (parse.data.isExcluded !== undefined) set.isExcluded = parse.data.isExcluded;
  if (parse.data.note !== undefined) set.note = parse.data.note || null;

  const updated = await getDb()
    .collection<TransactionDoc>('transactions')
    .findOneAndUpdate(
      { userId: userIdOf(req), id: String(req.params.id) },
      { $set: set },
      { returnDocument: 'after', projection: PUBLIC_PROJECTION },
    );

  if (!updated) {
    problem(res, 404, 'Transaction not found');
    return;
  }
  res.status(200).json(updated);
});
