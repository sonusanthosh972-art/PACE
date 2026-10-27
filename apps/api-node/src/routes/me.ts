import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { AuthenticatedRequest, requireAuth, userIdOf } from '../middleware/auth.js';
import { getDb } from '../db/mongo.js';
import { UserDoc, FixedExpenseDoc } from '../db/models.js';
import { problem, validationProblem } from '../http.js';
import { toProfileDto } from './auth.js';

export const meRouter = Router();
meRouter.use(requireAuth);

const MAX_PAISE = Number.MAX_SAFE_INTEGER;

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  salaryPaise: z.number().int().nonnegative().max(MAX_PAISE),
  payday: z.number().int().min(1).max(31),
  savingsGoalPaise: z.number().int().nonnegative().max(MAX_PAISE),
  timezone: z.string().trim().min(1).max(64).optional(),
});

const fixedExpensesSchema = z
  .array(
    z.object({
      id: z.string().trim().min(1).max(64).optional(),
      name: z.string().trim().min(1).max(80),
      amountPaise: z.number().int().positive().max(MAX_PAISE),
      dueDay: z.number().int().min(1).max(31),
    }),
  )
  .max(50);

function toFixedExpenseDto(i: FixedExpenseDoc) {
  return { id: i.id, name: i.name, amountPaise: i.amountPaise, dueDay: i.dueDay };
}

// GET /api/v1/me/profile
meRouter.get('/profile', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = await getDb().collection<UserDoc>('users').findOne({ id: userIdOf(req) });
  if (!user) {
    problem(res, 404, 'User not found');
    return;
  }
  res.status(200).json(toProfileDto(user));
});

// PUT /api/v1/me/profile
meRouter.put('/profile', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parse = updateProfileSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }

  const { name, timezone, ...budget } = parse.data;
  const set: Partial<UserDoc> = { ...budget, updatedAt: new Date() };
  if (name !== undefined) set.name = name;
  if (timezone !== undefined) set.timezone = timezone;

  const updated = await getDb()
    .collection<UserDoc>('users')
    .findOneAndUpdate({ id: userIdOf(req) }, { $set: set }, { returnDocument: 'after' });
  if (!updated) {
    problem(res, 404, 'User not found');
    return;
  }
  res.status(200).json(toProfileDto(updated));
});

// GET /api/v1/me/fixed-expenses
meRouter.get('/fixed-expenses', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const items = await getDb()
    .collection<FixedExpenseDoc>('fixedExpenses')
    .find({ userId: userIdOf(req) })
    .sort({ dueDay: 1 })
    .toArray();
  res.status(200).json(items.map(toFixedExpenseDto));
});

// PUT /api/v1/me/fixed-expenses — replaces the whole list
meRouter.put('/fixed-expenses', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parse = fixedExpensesSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }

  const userId = userIdOf(req);
  const now = Date.now();
  const docs: FixedExpenseDoc[] = parse.data.map((i) => ({
    id: i.id ?? crypto.randomUUID().replace(/-/g, ''),
    userId,
    name: i.name,
    amountPaise: i.amountPaise,
    dueDay: i.dueDay,
    createdAt: now,
  }));

  const collection = getDb().collection<FixedExpenseDoc>('fixedExpenses');
  await collection.deleteMany({ userId });
  if (docs.length > 0) await collection.insertMany(docs);

  res.status(200).json(docs.map(toFixedExpenseDto));
});

// DELETE /api/v1/me — deletes the account and every record it owns
meRouter.delete('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const db = getDb();
  const userId = userIdOf(req);

  await Promise.all([
    db.collection('fixedExpenses').deleteMany({ userId }),
    db.collection('transactions').deleteMany({ userId }),
    db.collection('userRules').deleteMany({ userId }),
    db.collection('dailySummaries').deleteMany({ userId }),
  ]);

  const result = await db.collection('users').deleteOne({ id: userId });
  if (result.deletedCount === 0) {
    problem(res, 404, 'User not found');
    return;
  }
  res.status(204).send();
});
