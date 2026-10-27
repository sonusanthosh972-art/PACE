import * as Notifications from 'expo-notifications';

import {
  initNotifications,
  rescheduleAll,
  CHANNEL_SCHEDULED,
  CHANNEL_LIVE,
} from '../notifications';

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  deleteNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('test-id'),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock repositories so we can test scheduler logic in isolation
jest.mock('@/data/appDb', () => ({
  getAppDb: jest.fn().mockResolvedValue({
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
    runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
  }),
}));

jest.mock('@/data/settingsRepo', () => ({
  getSettings: jest.fn().mockResolvedValue({
    onboardingComplete: true,
    notificationsEnabled: true,
    liveAlertsEnabled: true,
    morningTime: { hour: 8, minute: 0 },
    nightTime: { hour: 22, minute: 0 },
    weeklyTime: { hour: 19, minute: 0 },
  }),
  markOnce: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/data/profileRepo', () => ({
  getProfile: jest.fn().mockResolvedValue({
    monthlySalaryPaise: 100_000_00,
    payday: 1,
    fixedExpenses: [],
    monthlySavingsGoalPaise: 20_000_00,
  }),
}));

jest.mock('@/data/budgetRepo', () => ({
  getSnapshot: jest.fn().mockResolvedValue({
    todayBudgetPaise: 2_500_00,
    spentTodayPaise: 500_00,
    remainingTodayPaise: 2_000_00,
    usedRatio: 0.2,
  }),
  getOrFreezeBudget: jest.fn().mockResolvedValue(2_500_00),
  dayResults: jest.fn().mockResolvedValue([
    {
      date: '2026-10-23',
      budgetPaise: 2_500_00,
      spentPaise: 2_000_00,
      savedPaise: 500_00,
    },
  ]),
}));

jest.mock('@/data/transactionsRepo', () => ({
  listTransactions: jest.fn().mockResolvedValue([]),
}));

describe('notifications scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports correct channel identifiers', () => {
    expect(CHANNEL_SCHEDULED).toBe('scheduled-summaries-v2');
    expect(CHANNEL_LIVE).toBe('live-alerts-v2');
  });

  it('initialises notification channels and foreground handler', async () => {
    await initNotifications();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      CHANNEL_SCHEDULED,
      expect.objectContaining({ name: 'Daily summaries' }),
    );
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      CHANNEL_LIVE,
      expect.objectContaining({ name: 'Live payment alerts' }),
    );
    expect(Notifications.setNotificationHandler).toHaveBeenCalled();
    // A `sound` string is treated as a bundled file name; omitting it means the system sound.
    for (const [, config] of jest.mocked(Notifications.setNotificationChannelAsync).mock.calls) {
      expect(config).not.toHaveProperty('sound');
    }
    // v1 channels were created with an invalid sound and are removed.
    expect(Notifications.deleteNotificationChannelAsync).toHaveBeenCalledWith(
      'scheduled-summaries',
    );
    expect(Notifications.deleteNotificationChannelAsync).toHaveBeenCalledWith('live-alerts');
  });

  it('reschedules rolling days with channelId assigned to triggers', async () => {
    // 12:00 PM IST on Saturday Oct 24, 2026
    const noonMs = new Date('2026-10-24T06:30:00.000Z').getTime();
    await rescheduleAll(noonMs);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;

    // Verify all scheduled notifications use CHANNEL_SCHEDULED on their trigger
    for (const call of calls) {
      const request = call[0];
      expect(request.trigger).toHaveProperty('channelId', CHANNEL_SCHEDULED);
    }

    const identifiers = calls
      .map((c) => (c[0] as { identifier: string }).identifier)
      .filter(Boolean);
    expect(identifiers.some((id: string) => id.startsWith('night:'))).toBe(true);
    expect(identifiers.some((id: string) => id.startsWith('morning:'))).toBe(true);
  });
});
