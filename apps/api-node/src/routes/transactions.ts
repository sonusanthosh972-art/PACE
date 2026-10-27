import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/mongo.js';
import { TransactionDoc } from '../db/models.js';

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

const transactionInputSchema = z.object({
  id: z.string().optional(),
  amountPaise: z.number().int().positive(),
  direction: z.string().min(1),
  merchant: z.string().nullable().optional(),
  merchantNorm: z.string().nullable().optional(),
  vpa: z.string().nullable().optional(),
  mode: z.string().optional().default('UPI'),
  accountLast4: z.string().nullable().optional(),
  upiRef: z.string().nullable().optional(),
  balancePaise: z.number().int().nullable().optional(),
  category: z.string().min(1),
  needsReview: z.boolean().optional().default(false),
  note: z.string().nullable().optional(),
  source: z.string().optional().default('sms'),
  occurredAt: z.number().int(),
  dedupeHash: z.string().min(1),
  isExcluded: z.boolean().optional().default(false),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
});

const syncSchema = z.object({
  transactions: z.array(transactionInputSchema),
});

const patchSchema = z.object({
  category: z.string().optional(),
  isExcluded: z.boolean().optional(),
  note: z.string().nullable().optional(),
});

// POST /api/v1/transactions/sync
transactionsRouter.post('/sync', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parse = syncSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: parse.error.flatten().fieldErrors,
    });
    return;
  }

  const userId = req.userId!;
  const db = getDb();
  const collection = db.collection<TransactionDoc>('transactions');
  const nowMs = Date.now();

  let inserted = 0;
  let updated = 0;
  let total = 0;

  for (const t of parse.data.transactions) {
    const txId = t.id || crypto.randomUUID().replace(/-/g, '');
    const dedupeHash = t.dedupeHash.trim().toLowerCase();

    const result = await collection.updateOne(
      { userId, dedupeHash },
      {
        $setOnInsert: {
          id: txId,
          userId,
          dedupeHash,
          occurredAt: t.occurredAt,
          amountPaise: t.amountPaise,
          direction: t.direction.trim().toLowerCase(),
          mode: t.mode ?? 'UPI',
          source: t.source ?? 'sms',
          createdAt: t.createdAt ?? nowMs,
        },
        $set: {
          category: t.category.trim(),
          needsReview: t.needsReview,
          note: t.note ? t.note.trim() : null,
          isExcluded: t.isExcluded,
          merchant: t.merchant ? t.merchant.trim() : null,
          merchantNorm: t.merchantNorm ? t.merchantNorm.trim() : null,
          vpa: t.vpa ? t.vpa.trim() : null,
          accountLast4: t.accountLast4 ? t.accountLast4.trim() : null,
          upiRef: t.upiRef ? t.upiRef.trim() : null,
          balancePaise: t.balancePaise !== undefined ? t.balancePaise : null,
          updatedAt: t.updatedAt ?? nowMs,
        },
      },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      inserted++;
    } else if (result.matchedCount > 0) {
      updated++;
    }
    total++;
  }

  res.status(200).json({ inserted, updated, total });
});

// GET /api/v1/transactions
transactionsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const from = req.query.from ? Number(req.query.from) : undefined;
  const to = req.query.to ? Number(req.query.to) : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));

  const filter: any = { userId };
  if (from !== undefined) {
    filter.occurredAt = filter.occurredAt || {};
    filter.occurredAt.$gte = from;
  }
  if (to !== undefined) {
    filter.occurredAt = filter.occurredAt || {};
    filter.occurredAt.$lte = to;
  }
  if (category) {
    filter.category = category;
  }

  const db = getDb();
  const collection = db.collection<TransactionDoc>('transactions');

  const totalCount = await collection.countDocuments(filter);
  const totalPages = Math.ceil(totalCount / pageSize);

  const items = await collection
    .find(filter)
    .sort({ occurredAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray();

  res.status(200).json({
    items,
    totalCount,
    page,
    pageSize,
    totalPages,
  });
});

// PATCH /api/v1/transactions/:id
transactionsRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parse = patchSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: parse.error.flatten().fieldErrors,
    });
    return;
  }

  const userId = req.userId!;
  const txId = req.params.id;
  const db = getDb();
  const collection = db.collection<TransactionDoc>('transactions');

  const updateFields: any = { updatedAt: Date.now() };
  if (parse.data.category !== undefined) {
    updateFields.category = parse.data.category.trim();
  }
  if (parse.data.isExcluded !== undefined) {
    updateFields.isExcluded = parse.data.isExcluded;
  }
  if (parse.data.note !== undefined) {
    updateFields.note = parse.data.note ? parse.data.note.trim() : null;
  }

  const result = await collection.findOneAndUpdate(
    { userId, id: txId },
    { $set: updateFields },
    { returnDocument: 'after' }
  );

  const updated = result as unknown as TransactionDoc | null;
  if (!updated) {
    res.status(404).json({ status: 404, title: 'Transaction not found' });
    return;
  }

  res.status(200).json(updated);
});
