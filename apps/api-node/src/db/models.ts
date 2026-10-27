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
  refreshTokenHash?: string | null;
  refreshTokenExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
