import {
  pendingItemSchema,
  permissionResponseSchema,
  type PendingItem,
  type PermissionResponse,
} from './src/SmsReader.types';
import NativeSmsReader from './src/SmsReaderModule';

export type {
  PendingItem,
  PendingNotification,
  PendingSms,
  PermissionResponse,
} from './src/SmsReader.types';

const UNAVAILABLE: PermissionResponse = { status: 'denied', granted: false, canAskAgain: false };

function validItems(raw: readonly unknown[]): PendingItem[] {
  const items: PendingItem[] = [];
  for (const entry of raw) {
    const parsed = pendingItemSchema.safeParse(entry);
    if (parsed.success) items.push(parsed.data);
  }
  return items;
}

/** True when the native module is linked (Android development/production build). */
export function isAvailable(): boolean {
  return NativeSmsReader !== null;
}

export async function getSmsPermissions(): Promise<PermissionResponse> {
  if (!NativeSmsReader) return UNAVAILABLE;
  return permissionResponseSchema.parse(await NativeSmsReader.getSmsPermissionsAsync());
}

export async function requestSmsPermissions(): Promise<PermissionResponse> {
  if (!NativeSmsReader) return UNAVAILABLE;
  return permissionResponseSchema.parse(await NativeSmsReader.requestSmsPermissionsAsync());
}

/** Bank-sender SMS only (filtered natively) received since `sinceMs`. */
export async function readBankSms(sinceMs: number): Promise<PendingItem[]> {
  if (!NativeSmsReader) return [];
  return validItems(await NativeSmsReader.readBankSmsAsync(sinceMs));
}

export async function drainPending(): Promise<PendingItem[]> {
  if (!NativeSmsReader) return [];
  return validItems(await NativeSmsReader.drainPendingAsync());
}

export async function clearPending(): Promise<void> {
  await NativeSmsReader?.clearPendingAsync();
}

export function isNotificationAccessGranted(): boolean {
  return NativeSmsReader?.isNotificationAccessGranted() ?? false;
}

export function openNotificationAccessSettings(): void {
  NativeSmsReader?.openNotificationAccessSettings();
}

export function openAppSettings(): void {
  NativeSmsReader?.openAppSettings();
}

/** Fires when a bank SMS / payment notification has been queued while JS is running. */
export function addPendingListener(listener: () => void): { remove(): void } | null {
  return NativeSmsReader?.addListener('onPendingItems', () => listener()) ?? null;
}

/** Must match IngestHeadlessService.TASK_NAME. */
export const HEADLESS_TASK_NAME = 'PaisaPulseIngest';
