import type { ParsedTransaction } from '../transaction';
import { parseTransactionText } from './parseTransactionText';
import { isBankSender, isPaymentAppPackage } from './senders';

/**
 * parseSms(sender, body, receivedAt) → transaction fields or null.
 * Messages from non-bank senders are rejected before the body is even looked at.
 * occurredAt is the SMS receive time: banks send alerts within seconds, and body dates
 * are inconsistent across banks (and often lack a time).
 */
export function parseSms(
  sender: string,
  body: string,
  receivedAt: number,
): ParsedTransaction | null {
  if (!isBankSender(sender)) return null;
  return parseTransactionText(body, receivedAt, 'sms');
}

/** Backup source: payment-app / bank-app notifications (title + text). */
export function parseNotification(
  packageName: string,
  title: string,
  text: string,
  postedAt: number,
): ParsedTransaction | null {
  if (!isPaymentAppPackage(packageName)) return null;
  return parseTransactionText(`${title}. ${text}`, postedAt, 'notification');
}
