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
    title: 'Read bank SMS',
    why: 'We only read messages from banks. Personal chats are never read and never leave your phone.',
    points: [
      'Only senders like VM-HDFCBK or AD-SBIUPI are looked at. Everything else is skipped before it is opened.',
      'We take the amount, merchant and account ending. The message text itself is never stored or uploaded.',
      'We import the last 90 days once, so you see real numbers straight away.',
    ],
    cta: 'Allow SMS access',
    icon: 'chatbox-ellipses-outline',
  },
  notifications: {
    title: 'Budget reminders',
    why: 'A calm morning budget, a heads-up when you reach 80% and 100%, and a short night summary.',
    points: [
      'Scheduled on your phone, so they work offline.',
      'Change the times or turn them off any time in Settings.',
    ],
    cta: 'Allow notifications',
    icon: 'notifications-outline',
  },
  'notification-access': {
    title: 'Payment app alerts (optional)',
    why: 'A backup for when a bank SMS is late or missing: we read payment notifications from GPay, PhonePe, Paytm and bank apps only.',
    points: [
      'Notifications from any other app are ignored without being read.',
      'Android opens a settings page: turn on “Paisa Pulse payment alerts”, then come back.',
    ],
    cta: 'Open notification access',
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
