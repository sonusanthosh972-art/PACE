import { z } from 'zod';

import { CATEGORY_IDS } from './categories';

export const DIRECTIONS = ['debit', 'credit'] as const;
export const MODES = ['UPI', 'CARD', 'NEFT', 'IMPS', 'ATM', 'AUTOPAY', 'OTHER'] as const;
export const SOURCES = ['sms', 'notification', 'manual'] as const;

export type Direction = (typeof DIRECTIONS)[number];
export type Mode = (typeof MODES)[number];
export type Source = (typeof SOURCES)[number];

const paise = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Output of a parser (SMS/notification): fields only, raw text never included. */
export const parsedTransactionSchema = z.object({
  amountPaise: paise.positive(),
  direction: z.enum(DIRECTIONS),
  accountLast4: z
    .string()
    .regex(/^\d{3,4}$/)
    .nullable(),
  merchant: z.string().min(1).max(120).nullable(),
  vpa: z.string().max(120).nullable(),
  mode: z.enum(MODES),
  upiRef: z
    .string()
    .regex(/^\d{6,22}$/)
    .nullable(),
  balancePaise: paise.nullable(),
  occurredAt: z.number().int().positive(),
  source: z.enum(SOURCES),
});

export type ParsedTransaction = z.infer<typeof parsedTransactionSchema>;

/** A stored transaction (device SQLite row, also the sync payload shape). */
export const transactionSchema = parsedTransactionSchema.extend({
  id: z.string().min(1),
  merchantNorm: z.string(),
  category: z.enum(CATEGORY_IDS),
  /** True when the category came from the fallback and the user should tag it. */
  needsReview: z.boolean(),
  note: z.string().max(280).nullable(),
  dedupeHash: z.string().regex(/^[0-9a-f]{64}$/),
  isExcluded: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type Transaction = z.infer<typeof transactionSchema>;
