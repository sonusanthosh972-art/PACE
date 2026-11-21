import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { INFO, InfoButton } from '../InfoButton';

jest.mock('@/theme/ThemeProvider', () => {
  const { COLORS } = jest.requireActual<typeof import('@/theme/tokens')>('@/theme/tokens');
  return { useTheme: () => ({ colors: COLORS, reducedMotion: true }) };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('InfoButton', () => {
  it('explains a figure in a sheet without leaving the screen, and closes', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <InfoButton topic="safeToSpend" />
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('info-sheet-safeToSpend')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'What is Safe to spend?' }));
    expect(screen.getByTestId('info-sheet-safeToSpend')).toBeOnTheScreen();
    expect(screen.getByText(INFO.safeToSpend.body)).toBeOnTheScreen();

    // The close button inside the sheet (the backdrop is also labelled "Close").
    const closes = screen.getAllByRole('button', { name: 'Close' });
    await fireEvent.press(closes[closes.length - 1]!);
    expect(screen.queryByTestId('info-sheet-safeToSpend')).toBeNull();
  });

  it('closes when tapping outside the sheet', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <InfoButton topic="totalSpent" />
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'What is Total spent?' }));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Close' })[0]!);
    expect(screen.queryByTestId('info-sheet-totalSpent')).toBeNull();
  });

  it('keeps every explanation short and in everyday words', () => {
    for (const info of Object.values(INFO)) {
      expect(info.body.length).toBeLessThan(180);
      expect(info.body).not.toMatch(/liquidity|amortis|accrual|disposable income|EMI ratio/i);
    }
  });
});
