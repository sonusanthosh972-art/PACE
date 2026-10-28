import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { SmsReaderModuleEvents } from './SmsReader.types';

declare class SmsReaderNativeModule extends NativeModule<SmsReaderModuleEvents> {
  getSmsPermissionsAsync(): Promise<unknown>;
  requestSmsPermissionsAsync(): Promise<unknown>;
  readBankSmsAsync(sinceMs: number): Promise<unknown[]>;
  peekPendingAsync(): Promise<unknown[]>;
  ackPendingAsync(upToSeq: number): Promise<void>;
  clearPendingAsync(): Promise<void>;
  isNotificationAccessGranted(): boolean;
  openNotificationAccessSettings(): void;
  openAppSettings(): void;
}

/** Null on iOS/web, in Jest, and in builds without the native module. */
export default requireOptionalNativeModule<SmsReaderNativeModule>('SmsReader');
