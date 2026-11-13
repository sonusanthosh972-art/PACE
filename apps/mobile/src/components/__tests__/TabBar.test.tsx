import { fireEvent, render, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { TabBar } from '../TabBar';

const ROUTES = [
  { key: 'index-1', name: 'index', title: 'Today' },
  { key: 'insights-1', name: 'insights', title: 'Insights' },
  { key: 'transactions-1', name: 'transactions', title: 'Transactions' },
  { key: 'settings-1', name: 'settings', title: 'Settings' },
];

function props(activeIndex: number) {
  const navigate = jest.fn();
  const emit = jest.fn(() => ({ defaultPrevented: false }));
  const p = {
    state: {
      index: activeIndex,
      routes: ROUTES.map(({ key, name }) => ({ key, name, params: undefined })),
    },
    descriptors: Object.fromEntries(
      ROUTES.map((r) => [
        r.key,
        { options: { title: r.title, tabBarAccessibilityLabel: r.title } },
      ]),
    ),
    navigation: { navigate, emit },
    insets: { top: 0, bottom: 24, left: 0, right: 0 },
  } as unknown as BottomTabBarProps;
  return { p, navigate, emit };
}

describe('TabBar', () => {
  it('shows all four tabs with full labels and marks the active one', async () => {
    await render(<TabBar {...props(1).p} />);
    for (const r of ROUTES) expect(screen.getByText(r.title)).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Insights' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Today' })).not.toBeSelected();
  });

  it('navigates to another tab, and does nothing when the active tab is pressed', async () => {
    const { p, navigate, emit } = props(1);
    await render(<TabBar {...p} />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Transactions' }));
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'transactions-1' }),
    );
    expect(navigate).toHaveBeenCalledWith('transactions', undefined);

    navigate.mockClear();
    await fireEvent.press(screen.getByRole('tab', { name: 'Insights' }));
    expect(navigate).not.toHaveBeenCalled();
  });
});
