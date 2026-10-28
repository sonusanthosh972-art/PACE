import { z } from 'zod';

import { isCategoryId, type CategoryId } from '@/domain/categories';
import { MODES, SOURCES, type Direction, type Mode, type Source } from '@/domain/transaction';

export const userProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  salaryPaise: z.number().int(),
  payday: z.number().int().min(1).max(31),
  savingsGoalPaise: z.number().int(),
  timezone: z.string(),
  /** Day the budget was first set up (YYYY-MM-DD); older servers omit it. */
  budgetStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  user: userProfileSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const fixedExpenseItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  amountPaise: z.number().int(),
  dueDay: z.number().int().min(1).max(31),
});
export type RemoteFixedExpense = z.infer<typeof fixedExpenseItemSchema>;

export const fixedExpensesListSchema = z.array(fixedExpenseItemSchema);

export const syncResultSchema = z.object({
  inserted: z.number().int(),
  updated: z.number().int(),
  totalProcessed: z.number().int(),
});
export type SyncResult = z.infer<typeof syncResultSchema>;

export const deleteResultSchema = z.object({ deleted: z.number().int() });

export const remoteTransactionSchema = z.object({
  id: z.string().min(1),
  amountPaise: z.number().int().positive(),
  direction: z
    .string()
    .transform((d): Direction => (d.trim().toLowerCase() === 'credit' ? 'credit' : 'debit')),
  merchant: z.string().nullable().optional(),
  merchantNorm: z.string().nullable().optional(),
  vpa: z.string().nullable().optional(),
  mode: z
    .string()
    .default('OTHER')
    .transform((m): Mode => {
      const upper = m.trim().toUpperCase();
      return (MODES as readonly string[]).includes(upper) ? (upper as Mode) : 'OTHER';
    }),
  accountLast4: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v && /^\d{3,4}$/.test(v) ? v : null)),
  upiRef: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v && /^\d{6,22}$/.test(v) ? v : null)),
  balancePaise: z.number().int().nullable().optional(),
  category: z
    .string()
    .transform((c): CategoryId =>
      isCategoryId(c.trim()) ? (c.trim() as CategoryId) : 'uncategorised',
    ),
  needsReview: z.boolean().default(false),
  note: z.string().nullable().optional(),
  source: z
    .string()
    .default('sms')
    .transform((s): Source => {
      const lower = s.trim().toLowerCase();
      return (SOURCES as readonly string[]).includes(lower) ? (lower as Source) : 'sms';
    }),
  occurredAt: z.number().int().positive(),
  dedupeHash: z.string().transform((h) => {
    const clean = h.trim().toLowerCase();
    return /^[0-9a-f]{64}$/.test(clean) ? clean : clean.padEnd(64, '0').slice(0, 64);
  }),
  isExcluded: z.boolean().default(false),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type RemoteTransaction = z.infer<typeof remoteTransactionSchema>;

export const pagedTransactionsSchema = z.object({
  items: z.array(remoteTransactionSchema),
  totalCount: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});
export type PagedTransactions = z.infer<typeof pagedTransactionsSchema>;

export const healthSchema = z.object({
  status: z.string(),
  database: z.string().optional(),
});
