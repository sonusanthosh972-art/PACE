import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.js';
import { getDb } from '../db/mongo.js';
import { UserDoc, FixedExpenseDoc } from '../db/models.js';

export const meRouter = Router();
meRouter.use(requireAuth);

const updateProfileSchema = z.object({
  name: z.string().optional(),
  salaryPaise: z.number().int().nonnegative(),
  payday: z.number().int().min(1).max(31),
  savingsGoalPaise: z.number().int().nonnegative(),
  timezone: z.string().optional(),
});

const fixedExpenseItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  amountPaise: z.number().int().positive(),
  dueDay: z.number().int().min(1).max(31),
});

// GET /api/v1/me/profile
meRouter.get('/profile', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const db = getDb();
  const user = await db.collection<UserDoc>('users').findOne({ id: req.userId });
  if (!user) {
    res.status(404).json({ status: 404, title: 'User not found' });
    return;
  }

  res.status(200).json({
    id: user.id,
    email: user.email,
    name: user.name,
    salaryPaise: user.salaryPaise ?? 0,
    payday: user.payday ?? 1,
    savingsGoalPaise: user.savingsGoalPaise ?? 0,
    timezone: user.timezone || 'Asia/Kolkata',
  });
});

// PUT /api/v1/me/profile
meRouter.put('/profile', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parse = updateProfileSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: parse.error.flatten().fieldErrors,
    });
    return;
  }

  const { name, salaryPaise, payday, savingsGoalPaise, timezone } = parse.data;
  const db = getDb();
  const updateDoc: any = {
    salaryPaise,
    payday,
    savingsGoalPaise,
    updatedAt: new Date(),
  };
  if (name !== undefined) updateDoc.name = name.trim();
  if (timezone !== undefined) updateDoc.timezone = timezone.trim();

  const result = await db.collection<UserDoc>('users').findOneAndUpdate(
    { id: req.userId },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );

  const updated = result as unknown as UserDoc | null;
  if (!updated) {
    res.status(404).json({ status: 404, title: 'User not found' });
    return;
  }

  res.status(200).json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    salaryPaise: updated.salaryPaise ?? 0,
    payday: updated.payday ?? 1,
    savingsGoalPaise: updated.savingsGoalPaise ?? 0,
    timezone: updated.timezone || 'Asia/Kolkata',
  });
});

// GET /api/v1/me/fixed-expenses
meRouter.get('/fixed-expenses', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const db = getDb();
  const items = await db
    .collection<FixedExpenseDoc>('fixedExpenses')
    .find({ userId: req.userId })
    .sort({ dueDay: 1 })
    .toArray();

  res.status(200).json(
    items.map((i) => ({
      id: i.id,
      name: i.name,
      amountPaise: i.amountPaise,
      dueDay: i.dueDay,
    }))
  );
});

// PUT /api/v1/me/fixed-expenses
meRouter.put('/fixed-expenses', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const rawList = Array.isArray(req.body) ? req.body : [];
  const parsedList: any[] = [];

  for (const item of rawList) {
    const parse = fixedExpenseItemSchema.safeParse(item);
    if (!parse.success) {
      res.status(400).json({
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: parse.error.flatten().fieldErrors,
      });
      return;
    }
    parsedList.push(parse.data);
  }

  const db = getDb();
  const collection = db.collection<FixedExpenseDoc>('fixedExpenses');

  const domainItems: FixedExpenseDoc[] = parsedList.map((i) => ({
    id: i.id || crypto.randomUUID().replace(/-/g, ''),
    userId: req.userId!,
    name: i.name.trim(),
    amountPaise: i.amountPaise,
    dueDay: i.dueDay,
    createdAt: Date.now(),
  }));

  await collection.deleteMany({ userId: req.userId });
  if (domainItems.length > 0) {
    await collection.insertMany(domainItems as any);
  }

  res.status(200).json(
    domainItems.map((i) => ({
      id: i.id,
      name: i.name,
      amountPaise: i.amountPaise,
      dueDay: i.dueDay,
    }))
  );
});

// DELETE /api/v1/me
meRouter.delete('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const db = getDb();
  const userId = req.userId!;

  await Promise.all([
    db.collection('fixedExpenses').deleteMany({ userId }),
    db.collection('transactions').deleteMany({ userId }),
    db.collection('userRules').deleteMany({ userId }),
    db.collection('dailySummaries').deleteMany({ userId }),
  ]);

  const result = await db.collection('users').deleteOne({ id: userId });
  if (result.deletedCount === 0) {
    res.status(404).json({ status: 404, title: 'User not found' });
    return;
  }

  res.status(204).send();
});
