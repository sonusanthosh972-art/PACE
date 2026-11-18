import { useQueryClient } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';

import { TabBar } from '@/components/TabBar';
import { TAB_PAGES } from '@/components/tabPages';
import { prefetchTabData } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { MOTION } from '@/theme/tokens';

const TABS = Object.entries(TAB_PAGES).map(([name, page]) => ({ name, title: page.label }));

/** Wait for the app to settle (splash, Today's first render) before loading other tabs' data. */
const PREFETCH_DELAY_MS = 1500;

export default function TabsLayout() {
  const { colors, reducedMotion } = useTheme();
  const client = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => {
      prefetchTabData(client).catch(() => undefined);
    }, PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [client]);
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Pages shift gently left or right in the direction of the tab you tap.
        animation: reducedMotion ? 'none' : 'shift',
        transitionSpec: { animation: 'timing', config: { duration: MOTION.tabMs } },
        sceneStyle: { backgroundColor: colors.bg },
        // A tab you are not looking at is paused: data refreshes and animations wait until you
        // return, so they never compete with the screen you are on.
        freezeOnBlur: true,
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarAccessibilityLabel: t.title }}
        />
      ))}
    </Tabs>
  );
}
