import { Db } from 'mongodb';

export interface UserDoc {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  salaryPaise: number;
  payday: number;
  savingsGoalPaise: number;
  timezone: string;
  /** Day the budget was first set up on the phone (YYYY-MM-DD); prorates that first cycle. */
  budgetStartDate?: string | null;
  emailVerified?: boolean;
  /** Consecutive wrong passwords; reset on success. */
  failedLogins?: number;
  lockedUntil?: Date | null;
  /** Legacy single refresh token (before `sessions`); accepted once on refresh, then removed. */
  refreshTokenHash?: string | null;
  refreshTokenExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One signed-in device. Only the hash of its refresh token is stored. */
export interface SessionDoc {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
}

export type AuthCodePurpose = 'reset_password' | 'verify_email';

/** Short-lived emailed code (password reset / email verification). Only an HMAC is stored. */
export interface AuthCodeDoc {
  userId: string;
  purpose: AuthCodePurpose;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
}

/** Cross-instance lock so a scheduled job runs once even with several API instances. */
export interface JobLockDoc {
  _id: string;
  lockedUntil: Date;
  owner: string;
}

export interface FixedExpenseDoc {
  id: string;
  userId: string;
  name: string;
  amountPaise: number;
  dueDay: number;
  createdAt: number;
}

export interface TransactionDoc {
  id: string;
  userId: string;
  amountPaise: number;
  direction: string;
  merchant?: string | null;
  merchantNorm?: string | null;
  vpa?: string | null;
  mode: string;
  accountLast4?: string | null;
  upiRef?: string | null;
  balancePaise?: number | null;
  category: string;
  needsReview: boolean;
  note?: string | null;
  source: string;
  occurredAt: number;
  dedupeHash: string;
  isExcluded: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DailySummaryDoc {
  id: string;
  userId: string;
  dateKey: string;
  budgetPaise: number;
  spentPaise: number;
  topCategory?: string | null;
  calculatedAt: Date;
}
