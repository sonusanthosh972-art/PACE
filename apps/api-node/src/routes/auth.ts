import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { MongoServerError } from 'mongodb';
import { getDb } from '../db/mongo.js';
import { UserDoc } from '../db/models.js';
import { hashPassword, verifyPassword, generateTokens, hashRefreshToken } from '../services/auth.js';
import { problem, validationProblem } from '../http.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(512),
});

export function toProfileDto(user: UserDoc) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    salaryPaise: user.salaryPaise ?? 0,
    payday: user.payday ?? 1,
    savingsGoalPaise: user.savingsGoalPaise ?? 0,
    timezone: user.timezone || 'Asia/Kolkata',
  };
}

// POST /api/v1/auth/register
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }

  const { email, password, name } = parse.data;
  const db = getDb();
  const users = db.collection<UserDoc>('users');

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await users.findOne({ email: normalizedEmail });
  if (existing) {
    problem(res, 409, 'Email already registered', 'An account with this email address already exists.');
    return;
  }

  const userId = crypto.randomUUID().replace(/-/g, '');
  const hashedPw = await hashPassword(password);
  const now = new Date();

  const newUser: UserDoc = {
    id: userId,
    email: normalizedEmail,
    passwordHash: hashedPw,
    name: name.trim(),
    salaryPaise: 0,
    payday: 1,
    savingsGoalPaise: 0,
    timezone: 'Asia/Kolkata',
    createdAt: now,
    updatedAt: now,
  };

  const tokens = generateTokens({ id: userId, email: normalizedEmail, name: newUser.name });
  newUser.refreshTokenHash = hashRefreshToken(tokens.refreshToken);
  newUser.refreshTokenExpiresAt = tokens.refreshTokenExpiresAt;

  try {
    await users.insertOne(newUser);
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      problem(res, 409, 'Email already registered', 'An account with this email address already exists.');
      return;
    }
    throw err;
  }

  res.status(201).json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: toProfileDto(newUser),
  });
});

// POST /api/v1/auth/login
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }

  const { email, password } = parse.data;
  const db = getDb();
  const users = db.collection<UserDoc>('users');

  const normalizedEmail = email.trim().toLowerCase();
  const user = await users.findOne({ email: normalizedEmail });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    problem(res, 401, 'Invalid credentials', 'Invalid email or password.');
    return;
  }

  const tokens = generateTokens({ id: user.id, email: user.email, name: user.name });
  const refreshTokenHash = hashRefreshToken(tokens.refreshToken);

  await users.updateOne(
    { id: user.id },
    {
      $set: {
        refreshTokenHash,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
        updatedAt: new Date(),
      },
    }
  );

  res.status(200).json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: toProfileDto(user),
  });
});

// POST /api/v1/auth/refresh
authRouter.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const parse = refreshSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }

  const { refreshToken } = parse.data;
  const db = getDb();
  const users = db.collection<UserDoc>('users');

  const hashed = hashRefreshToken(refreshToken);
  const existing = await users.findOne({ refreshTokenHash: hashed, refreshTokenExpiresAt: { $gt: new Date() } });
  if (!existing) {
    problem(res, 401, 'Invalid token', 'Invalid or expired refresh token.');
    return;
  }

  // Rotate atomically: the old token only matches once, so a replayed token fails.
  const tokens = generateTokens({ id: existing.id, email: existing.email, name: existing.name });
  const user = await users.findOneAndUpdate(
    { id: existing.id, refreshTokenHash: hashed },
    {
      $set: {
        refreshTokenHash: hashRefreshToken(tokens.refreshToken),
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );
  if (!user) {
    problem(res, 401, 'Invalid token', 'Invalid or expired refresh token.');
    return;
  }

  res.status(200).json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: toProfileDto(user),
  });
});
