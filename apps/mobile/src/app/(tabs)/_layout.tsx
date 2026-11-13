import { Tabs } from 'expo-router';

import { TabBar } from '@/components/TabBar';
import { TAB_PAGES } from '@/components/tabPages';
import { useTheme } from '@/theme/ThemeProvider';
import { MOTION } from '@/theme/tokens';

const TABS = Object.entries(TAB_PAGES).map(([name, page]) => ({ name, title: page.label }));

export default function TabsLayout() {
  const { colors, reducedMotion } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Pages shift gently left or right in the direction of the tab you tap.
        animation: reducedMotion ? 'none' : 'shift',
        transitionSpec: { animation: 'timing', config: { duration: MOTION.tabMs } },
        sceneStyle: { backgroundColor: colors.bg },
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
