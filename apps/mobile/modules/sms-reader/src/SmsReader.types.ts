import { z } from 'zod';

export const pendingSmsSchema = z.object({
  kind: z.literal('sms'),
  sender: z.string(),
  body: z.string(),
  receivedAt: z.number(),
  /** Position in the native queue (live items only), used to acknowledge once stored. */
  queueSeq: z.number().optional(),
});

export const pendingNotificationSchema = z.object({
  kind: z.literal('notification'),
  packageName: z.string(),
  title: z.string(),
  text: z.string(),
  postedAt: z.number(),
  queueSeq: z.number().optional(),
});

/** An SMS or notification queued natively, waiting to be parsed. Raw text stays on device. */
export const pendingItemSchema = z.discriminatedUnion('kind', [
  pendingSmsSchema,
  pendingNotificationSchema,
]);

export type PendingSms = z.infer<typeof pendingSmsSchema>;
export type PendingNotification = z.infer<typeof pendingNotificationSchema>;
export type PendingItem = z.infer<typeof pendingItemSchema>;

export const permissionResponseSchema = z.object({
  status: z.enum(['granted', 'denied', 'undetermined']),
  granted: z.boolean(),
  canAskAgain: z.boolean(),
});

export type PermissionResponse = z.infer<typeof permissionResponseSchema>;

export type SmsReaderModuleEvents = {
  onPendingItems: (event: { count: number }) => void;
};
