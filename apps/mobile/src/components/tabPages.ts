import type { IconName } from './Icon';

export type TabPage = 'index' | 'insights' | 'transactions' | 'settings';

/**
 * Each tab's name and icon. The bottom bar and every page header use this one list, so the label
 * on a page always matches the tab that opened it.
 */
export const TAB_PAGES: Record<TabPage, { label: string; icon: IconName }> = {
  index: { label: 'Today', icon: 'home-outline' },
  insights: { label: 'Insights', icon: 'stats-chart-outline' },
  transactions: { label: 'Transactions', icon: 'swap-horizontal-outline' },
  settings: { label: 'Settings', icon: 'settings-outline' },
};

export function isTabPage(name: string): name is TabPage {
  return name in TAB_PAGES;
}
