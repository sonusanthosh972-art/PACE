import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { MongoServerError } from 'mongodb';
import { getDb } from '../db/mongo.js';
import { UserDoc } from '../db/models.js';
import {
  CODE_TTL_MS,
  consumeCode,
  hashPassword,
  issueCode,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  startSession,
  verifyPasswordOrDummy,
} from '../services/auth.js';
import { mailConfigured, sendMail } from '../services/mailer.js';
import { problem, validationProblem } from '../http.js';
import { logger } from '../logger.js';

export const authRouter = Router();

/** Wrong passwords in a row before the account is locked for LOCKOUT_MS. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

const email = z.string().trim().email().max(254);
const newPassword = z.string().min(8).max(128);

const registerSchema = z.object({
  email,
  password: newPassword,
  name: z.string().trim().min(1).max(100),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(512),
});

const forgotSchema = z.object({ email });

const resetSchema = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/),
  newPassword,
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
    budgetStartDate: user.budgetStartDate ?? null,
    emailVerified: user.emailVerified ?? false,
  };
}

const minutes = Math.round(CODE_TTL_MS / 60_000);

/** Emails a verification code. Best effort: a mail failure never fails the caller. */
export async function sendVerificationCode(user: Pick<UserDoc, 'id' | 'email'>): Promise<boolean> {
  try {
    const code = await issueCode(user.id, 'verify_email');
    await sendMail({
      to: user.email,
      subject: 'Your Paisa Pulse verification code',
      text: `Your verification code is ${code}. It expires in ${minutes} minutes.`,
    });
    return true;
  } catch (err) {
    logger.error({ err }, '[Auth] Could not send verification code');
    return false;
  }
}

// POST /api/v1/auth/register
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }

  const { password, name } = parse.data;
  const users = getDb().collection<UserDoc>('users');
  const normalizedEmail = parse.data.email.toLowerCase();

  const existing = await users.findOne({ email: normalizedEmail });
  if (existing) {
    problem(res, 409, 'Email already registered', 'An account with this email address already exists.');
    return;
  }

  const now = new Date();
  const newUser: UserDoc = {
    id: crypto.randomUUID().replace(/-/g, ''),
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    name: name.trim(),
    salaryPaise: 0,
    payday: 1,
    savingsGoalPaise: 0,
    timezone: 'Asia/Kolkata',
    emailVerified: false,
    failedLogins: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await users.insertOne(newUser);
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      problem(res, 409, 'Email already registered', 'An account with this email address already exists.');
      return;
    }
    throw err;
  }

  const tokens = await startSession(newUser);
  void sendVerificationCode(newUser);

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

  const users = getDb().collection<UserDoc>('users');
  const user = await users.findOne({ email: parse.data.email.toLowerCase() });

  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const waitMin = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    problem(
      res,
      429,
      'Account temporarily locked',
      `Too many wrong passwords. Try again in ${waitMin} minute${waitMin === 1 ? '' : 's'}, or reset your password.`,
    );
    return;
  }

  // Same bcrypt time whether or not the account exists.
  const ok = await verifyPasswordOrDummy(parse.data.password, user?.passwordHash);
  if (!user || !ok) {
    if (user) {
      const failed = (user.failedLogins ?? 0) + 1;
      await users.updateOne(
        { id: user.id },
        {
          $set: {
            failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
            lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null,
          },
        },
      );
    }
    problem(res, 401, 'Invalid credentials', 'Invalid email or password.');
    return;
  }

  if (user.failedLogins || user.lockedUntil) {
    await users.updateOne({ id: user.id }, { $set: { failedLogins: 0, lockedUntil: null } });
  }
  const tokens = await startSession(user);

  res.status(200).json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: toProfileDto(user),
  });
});

// POST /api/v1/auth/refresh — rotates: the old refresh token works exactly once
authRouter.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const parse = refreshSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }

  const rotated = await rotateSession(parse.data.refreshToken);
  if (!rotated) {
    problem(res, 401, 'Invalid token', 'Invalid or expired refresh token.');
    return;
  }

  res.status(200).json({
    accessToken: rotated.tokens.accessToken,
    refreshToken: rotated.tokens.refreshToken,
    user: toProfileDto(rotated.user),
  });
});

// POST /api/v1/auth/logout — ends this device's session (always 204)
authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const parse = refreshSchema.safeParse(req.body);
  if (parse.success) await revokeSession(parse.data.refreshToken);
  res.status(204).send();
});

// POST /api/v1/auth/forgot-password — always 202, so it never reveals which emails exist
authRouter.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const parse = forgotSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }
  if (!mailConfigured()) {
    problem(res, 503, 'Password reset unavailable', 'Email is not set up on the server yet.');
    return;
  }

  const user = await getDb()
    .collection<UserDoc>('users')
    .findOne({ email: parse.data.email.toLowerCase() });
  if (user) {
    try {
      const code = await issueCode(user.id, 'reset_password');
      await sendMail({
        to: user.email,
        subject: 'Reset your Paisa Pulse password',
        text:
          `Your password reset code is ${code}. It expires in ${minutes} minutes.\n\n` +
          'If you did not ask for this, you can ignore this email; your password stays the same.',
      });
    } catch (err) {
      logger.error({ err }, '[Auth] Could not send reset code');
    }
  }
  res.status(202).json({ status: 202, title: 'If that email has an account, a reset code is on its way.' });
});

// POST /api/v1/auth/reset-password — sets a new password and signs out every device
authRouter.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const parse = resetSchema.safeParse(req.body);
  if (!parse.success) {
    validationProblem(res, parse.error);
    return;
  }

  const users = getDb().collection<UserDoc>('users');
  const user = await users.findOne({ email: parse.data.email.toLowerCase() });
  if (!user || !(await consumeCode(user.id, 'reset_password', parse.data.code))) {
    problem(res, 400, 'Invalid code', 'The code is wrong or has expired. Request a new one.');
    return;
  }

  await users.updateOne(
    { id: user.id },
    {
      $set: {
        passwordHash: await hashPassword(parse.data.newPassword),
        failedLogins: 0,
        lockedUntil: null,
        // Receiving the code proves the inbox belongs to the user.
        emailVerified: true,
        updatedAt: new Date(),
      },
    },
  );
  await revokeAllSessions(user.id);
  res.status(204).send();
});
