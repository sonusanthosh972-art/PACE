import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import * as SmsReader from '../../modules/sms-reader';

export type PermissionKind = 'sms' | 'notifications' | 'notification-access';
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export const PERMISSION_COPY: Record<
  PermissionKind,
  { title: string; why: string; points: string[]; cta: string; icon: string }
> = {
  sms: {
    title: 'Automatic bank SMS updates',
    why: 'Paisa Pulse updates your daily allowance effortlessly by recognizing bank transaction alerts. Personal chats and family messages are completely ignored, and bank OTP messages are discarded immediately.',
    points: [
      'Strict bank-sender filter: Only verified institutions (e.g. HDFC, SBI, ICICI, Axis) are processed.',
      'Only the spent amount and merchant are stored. SMS body texts are discarded immediately.',
      'On-device SMS processing: Raw SMS never leave your phone. If you sign in, amounts and merchants are backed up to your server.',
    ],
    cta: 'Enable automatic bank updates',
    icon: 'chatbox-ellipses-outline',
  },
  notifications: {
    title: 'Mindful budget reminders',
    why: 'A gentle morning check-in to begin your day with clarity, a quiet heads-up if you near your allowance, and a reassuring evening summary.',
    points: [
      'Quiet and respectful: No spam, no marketing offers, and no intrusive popups.',
      'Completely offline: Reminders are generated directly on your device.',
      'Adjust times or pause them whenever you wish in Settings.',
    ],
    cta: 'Allow mindful reminders',
    icon: 'notifications-outline',
  },
  'notification-access': {
    title: 'Payment app sync (Optional)',
    why: 'A helpful backup when bank SMS is delayed: captures payments from Google Pay, PhonePe, Paytm, or BHIM instantly as you tap and pay.',
    points: [
      'Only payment receipts from financial apps are processed.',
      'Messages from WhatsApp, social media, and personal chats are completely ignored.',
      'You can turn this off anytime in your phone settings.',
    ],
    cta: 'Connect payment apps',
    icon: 'notifications-circle-outline',
  },
};

export async function getPermissionState(kind: PermissionKind): Promise<PermissionState> {
  if (kind === 'notifications') {
    const res = await Notifications.getPermissionsAsync();
    return res.granted ? 'granted' : res.canAskAgain ? 'undetermined' : 'denied';
  }
  if (Platform.OS !== 'android' || !SmsReader.isAvailable()) return 'unavailable';
  if (kind === 'sms') {
    const res = await SmsReader.getSmsPermissions();
    return res.granted ? 'granted' : res.canAskAgain ? 'undetermined' : 'denied';
  }
  return SmsReader.isNotificationAccessGranted() ? 'granted' : 'undetermined';
}

/** Shows the system prompt (or settings page) for a permission. */
export async function requestPermission(kind: PermissionKind): Promise<PermissionState> {
  if (kind === 'notifications') {
    const res = await Notifications.requestPermissionsAsync();
    return res.granted ? 'granted' : 'denied';
  }
  if (Platform.OS !== 'android' || !SmsReader.isAvailable()) return 'unavailable';
  if (kind === 'sms') {
    const current = await SmsReader.getSmsPermissions();
    if (!current.granted && !current.canAskAgain) {
      SmsReader.openAppSettings();
      return 'denied';
    }
    const res = await SmsReader.requestSmsPermissions();
    return res.granted ? 'granted' : 'denied';
  }
  SmsReader.openNotificationAccessSettings();
  return 'undetermined';
}
