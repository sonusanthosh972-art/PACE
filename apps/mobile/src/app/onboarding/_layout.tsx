import { Stack } from 'expo-router';

import { useTheme } from '@/theme/ThemeProvider';
import { MOTION } from '@/theme/tokens';

export default function OnboardingLayout() {
  const { colors, reducedMotion } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: reducedMotion ? 'fade' : 'slide_from_right',
        animationDuration: MOTION.screenMs,
      }}
    />
  );
}
