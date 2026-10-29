import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { AuthenticatedRequest, requireAuth, userIdOf } from '../middleware/auth.js';
import { getDb } from '../db/mongo.js';
import { UserDoc, FixedExpenseDoc } from '../db/models.js';
import { problem, validationProblem } from '../http.js';
import {
  consumeCode,
  hashPassword,
  revokeAllSessions,
  startSession,
  verifyPassword,
} from '../services/auth.js';
import { sendVerificationCode, toProfileDto } from './auth.js';

export const meRouter = Router();
meRouter.use(requireAuth);

const MAX_PAISE = Number.MAX_SAFE_INTEGER;

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  salaryPaise: z.number().int().nonnegative().max(MAX_PAISE),
  payday: z.number().int().min(1).max(31),
  savingsGoalPaise: z.number().int().nonnegative().max(MAX_PAISE),
  timezone: z.string().trim().min(1).max(64).optional(),
  budgetStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

const verifyEmailSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

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

  const { name, timezone, budgetStartDate, ...budget } = parse.data;
  const set: Partial<UserDoc> = { ...budget, updatedAt: new Date() };
  if (name !== undefined) set.name = name;
  if (timezone !== undefined) set.timezone = timezone;
  if (budgetStartDate !== undefined) set.budgetStartDate = budgetStartDate;

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

  // Upsert the new list first, then remove what is no longer in it: a failure half-way never
  // leaves the user with an empty list.
  const collection = getDb().collection<FixedExpenseDoc>('fixedExpenses');
  if (docs.length > 0) {
    await collection.bulkWrite(
      docs.map((doc) => ({ replaceOne: { filter: { userId, id: doc.id }, replacement: doc, upsert: true } })),
      { ordered: false },
    );
  }
  await collection.deleteMany({ userId, id: { $nin: docs.map((d) => d.id) } });

  res.status(200).json(docs.map(toFixedExpenseDto));
});

// POST /api/v1/me/password — signs out every other device and returns fresh tokens for this one
meRouter.post('/password', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parse = changePasswordSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }
  const users = getDb().collection<UserDoc>('users');
  const user = await users.findOne({ id: userIdOf(req) });
  if (!user) {
    problem(res, 404, 'User not found');
    return;
  }
  if (!(await verifyPassword(parse.data.currentPassword, user.passwordHash))) {
    problem(res, 400, 'Wrong password', 'Your current password is not correct.');
    return;
  }

  await users.updateOne(
    { id: user.id },
    { $set: { passwordHash: await hashPassword(parse.data.newPassword), updatedAt: new Date() } },
  );
  await revokeAllSessions(user.id);
  const tokens = await startSession(user);
  res.status(200).json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: toProfileDto(user),
  });
});

// POST /api/v1/me/verify-email/send — emails a new verification code
meRouter.post('/verify-email/send', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = await getDb().collection<UserDoc>('users').findOne({ id: userIdOf(req) });
  if (!user) {
    problem(res, 404, 'User not found');
    return;
  }
  if (user.emailVerified) {
    res.status(204).send();
    return;
  }
  if (!(await sendVerificationCode(user))) {
    problem(res, 503, 'Email unavailable', 'Could not send the code. Try again later.');
    return;
  }
  res.status(202).json({ status: 202, title: 'Verification code sent.' });
});

// POST /api/v1/me/verify-email — confirms the emailed code
meRouter.post('/verify-email', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parse = verifyEmailSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }
  const userId = userIdOf(req);
  if (!(await consumeCode(userId, 'verify_email', parse.data.code))) {
    problem(res, 400, 'Invalid code', 'The code is wrong or has expired. Request a new one.');
    return;
  }
  const updated = await getDb()
    .collection<UserDoc>('users')
    .findOneAndUpdate(
      { id: userId },
      { $set: { emailVerified: true, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
  if (!updated) {
    problem(res, 404, 'User not found');
    return;
  }
  res.status(200).json(toProfileDto(updated));
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
    db.collection('sessions').deleteMany({ userId }),
    db.collection('authCodes').deleteMany({ userId }),
  ]);

  const result = await db.collection('users').deleteOne({ id: userId });
  if (result.deletedCount === 0) {
    problem(res, 404, 'User not found');
    return;
  }
  res.status(204).send();
});
