import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', title: 'Today', icon: 'home-outline', iconActive: 'home' },
  { name: 'insights', title: 'Insights', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { name: 'transactions', title: 'Transactions', icon: 'list-outline', iconActive: 'list' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline', iconActive: 'settings' },
];

export default function TabsLayout() {
  const { colors, reducedMotion } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: reducedMotion ? 'none' : 'fade',
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: FONT.medium, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.nav,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          minHeight: 64,
          paddingTop: 6,
        },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? t.iconActive : t.icon} color={color} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
