import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { getDb } from '../db/mongo.js';
import { UserDoc } from '../db/models.js';
import { hashPassword, verifyPassword, generateTokens, hashRefreshToken } from '../services/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

function toProfileDto(user: UserDoc) {
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
    res.status(400).json({
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: parse.error.flatten().fieldErrors,
    });
    return;
  }

  const { email, password, name } = parse.data;
  const db = getDb();
  const users = db.collection<UserDoc>('users');

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await users.findOne({ email: normalizedEmail });
  if (existing) {
    res.status(409).json({
      title: 'Email already registered',
      detail: 'An account with this email address already exists.',
      status: 409,
    });
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

  await users.insertOne(newUser as any);

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
    res.status(400).json({
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: parse.error.flatten().fieldErrors,
    });
    return;
  }

  const { email, password } = parse.data;
  const db = getDb();
  const users = db.collection<UserDoc>('users');

  const normalizedEmail = email.trim().toLowerCase();
  const user = await users.findOne({ email: normalizedEmail });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({
      title: 'Invalid credentials',
      detail: 'Invalid email or password.',
      status: 401,
    });
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
    res.status(400).json({
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: parse.error.flatten().fieldErrors,
    });
    return;
  }

  const { refreshToken } = parse.data;
  const db = getDb();
  const users = db.collection<UserDoc>('users');

  const hashed = hashRefreshToken(refreshToken);
  const now = new Date();
  const user = await users.findOne({
    refreshTokenHash: hashed,
    refreshTokenExpiresAt: { $gt: now },
  });

  if (!user) {
    res.status(401).json({
      title: 'Invalid token',
      detail: 'Invalid or expired refresh token.',
      status: 401,
    });
    return;
  }

  const tokens = generateTokens({ id: user.id, email: user.email, name: user.name });
  const newHash = hashRefreshToken(tokens.refreshToken);

  await users.updateOne(
    { id: user.id },
    {
      $set: {
        refreshTokenHash: newHash,
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
