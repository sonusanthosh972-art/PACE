import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AssistantMessage } from '@/data/assistantRepo';
import { AssistantError } from '@/services/assistant';
import { useAuthStore } from '@/state/authStore';

import AssistantScreen from '../assistant';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn() },
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

let mockStored: AssistantMessage[] = [];
jest.mock('@/data/appDb', () => ({ getAppDb: jest.fn().mockResolvedValue({}) }));
jest.mock('@/data/assistantRepo', () => ({
  listAssistantMessages: jest.fn(async () => [...mockStored]),
  saveAssistantMessage: jest.fn(async (_db: unknown, m: AssistantMessage) => {
    mockStored = [...mockStored.filter((x) => x.id !== m.id), m];
  }),
  deleteAssistantMessage: jest.fn(async (_db: unknown, id: string) => {
    mockStored = mockStored.filter((x) => x.id !== id);
  }),
  clearAssistantMessages: jest.fn(async () => {
    mockStored = [];
  }),
}));

const mockStream = jest.fn();
const mockStatus = jest.fn();
jest.mock('@/services/assistant', () => {
  const actual = jest.requireActual<typeof import('@/services/assistant')>('@/services/assistant');
  return {
    ...actual,
    fetchAssistantStatus: () => mockStatus(),
    syncBeforeAsking: jest.fn().mockResolvedValue(undefined),
    streamAssistantReply: (args: unknown) => mockStream(args),
  };
});

let mockDemo = false;
jest.mock('@/state/queries', () => ({
  useSettings: () => ({ data: { demoMode: mockDemo } }),
}));
jest.mock('@/theme/ThemeProvider', () => {
  const { COLORS } = jest.requireActual<typeof import('@/theme/tokens')>('@/theme/tokens');
  return { useTheme: () => ({ colors: COLORS, reducedMotion: true }) };
});

const ENABLED = {
  enabled: true,
  dailyMessageLimit: 40,
  usedToday: 0,
  remainingToday: 40,
  maxMessageChars: 1500,
};

async function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <AssistantScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  await flush();
}

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

beforeEach(() => {
  mockStored = [];
  mockDemo = false;
  mockPush.mockReset();
  mockStream.mockReset();
  mockStatus.mockReset().mockResolvedValue(ENABLED);
  useAuthStore.setState({ isAuthenticated: true });
});

describe('Money Assistant screen', () => {
  it('asks people without an account to sign in, and sends nothing', async () => {
    useAuthStore.setState({ isAuthenticated: false });
    await open();
    expect(screen.getByText('Sign in to use the assistant')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(mockPush).toHaveBeenCalledWith('/settings/auth?mode=login');
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it('never sends sample data', async () => {
    mockDemo = true;
    await open();
    expect(screen.getByText('Not available with sample data')).toBeOnTheScreen();
  });

  it('offers quick prompts and suggested questions when the chat is empty', async () => {
    await open();
    for (const label of [
      'Analyse my spending',
      'Can I afford this?',
      'Help me save money',
      'How am I doing?',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
    }
    expect(
      screen.getByRole('button', { name: 'Compare this month with last month.' }),
    ).toBeOnTheScreen();
  });

  it('streams an answer into the chat, saves both turns, and copies without markdown', async () => {
    mockStream.mockImplementation(async ({ onText }: { onText: (t: string) => void }) => {
      onText('You have **₹2,000**');
      return 'You have **₹2,000** left this cycle.';
    });
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'How am I doing?' }));
    await flush();

    expect(screen.getByLabelText('You: How am I doing this month?')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Assistant: You have **₹2,000** left this cycle.'),
    ).toBeOnTheScreen();
    expect(mockStream.mock.calls[0][0].history).toEqual([
      { role: 'user', content: 'How am I doing this month?' },
    ]);
    expect(mockStored.map((m) => m.role)).toEqual(['user', 'assistant']);

    await fireEvent.press(screen.getByRole('button', { name: 'Copy' }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('You have ₹2,000 left this cycle.');
  });

  it('shows a failed answer with Try again, and retries the same question', async () => {
    mockStream
      .mockRejectedValueOnce(new AssistantError('The assistant is busy right now.', true))
      .mockResolvedValueOnce('Here is your plan.');
    await open();
    await fireEvent.changeText(screen.getByLabelText('Your question'), 'Help me save');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    await flush();

    expect(screen.getByText('The assistant is busy right now.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await flush();

    expect(screen.queryByText('The assistant is busy right now.')).toBeNull();
    expect(screen.getByLabelText('Assistant: Here is your plan.')).toBeOnTheScreen();
    expect(mockStream).toHaveBeenCalledTimes(2);
    expect(mockStream.mock.calls[1][0].history).toEqual([
      { role: 'user', content: 'Help me save' },
    ]);
  });

  it('restores the saved conversation and clears it after confirming', async () => {
    mockStored = [
      { id: 'a', role: 'user', content: 'Old question', status: 'done', createdAt: 1 },
      { id: 'b', role: 'assistant', content: 'Old answer', status: 'done', createdAt: 2 },
    ];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Clear')?.onPress?.();
    });
    await open();
    expect(screen.getByText('Old question')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear conversation' }));
    await flush();
    expect(screen.queryByText('Old question')).toBeNull();
    expect(mockStored).toEqual([]);
    alert.mockRestore();
  });

  it('says when the assistant is switched off and disables sending', async () => {
    mockStatus.mockResolvedValue({ ...ENABLED, enabled: false });
    await open();
    expect(
      screen.getByText("The assistant isn't switched on for this server yet."),
    ).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Your question'), 'hello');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(mockStream).not.toHaveBeenCalled();
  });
});

describe('Money Assistant on an older server', () => {
  it('says the assistant is not on the server yet instead of a raw error', async () => {
    mockStatus.mockRejectedValue(Object.assign(new Error('not found'), { statusCode: 404 }));
    await open();
    expect(
      screen.getByText("The Money Assistant isn't available on the PACE server yet."),
    ).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Your question'), 'hello');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(mockStream).not.toHaveBeenCalled();
  });
});
