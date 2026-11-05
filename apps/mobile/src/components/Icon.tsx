import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { useTheme } from '@/theme/ThemeProvider';

import type { TextColor } from './AppText';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Decorative by default (hidden from screen readers); pair with text for meaning. */
export function Icon({
  name,
  size = 22,
  color = 'text',
  tint,
}: {
  name: IconName;
  size?: number;
  color?: TextColor | 'amber' | 'coral';
  /** A raw colour (e.g. a category colour); overrides `color`. */
  tint?: string;
}) {
  const { colors } = useTheme();
  return (
    <Ionicons
      name={name}
      size={size}
      color={tint ?? colors[color]}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
