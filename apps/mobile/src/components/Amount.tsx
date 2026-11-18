import { memo } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { formatINR, formatINRWhole, type Paise } from '@/domain/money';
import { useTheme } from '@/theme/ThemeProvider';
import type { TypeVariant } from '@/theme/tokens';

import { AppText, type TextColor } from './AppText';
import { useCountUp } from './useCountUp';

interface AmountProps {
  paise: Paise;
  variant?: TypeVariant;
  color?: TextColor;
  /** Show paise (₹1,250.50) instead of whole rupees (₹1,250). */
  exact?: boolean;
  /** Roll up/down when the value changes. */
  animated?: boolean;
  prefix?: string;
  suffix?: string;
  /** Stay on one line and shrink the text to the available width (e.g. inside the ring). */
  fit?: boolean;
  style?: StyleProp<TextStyle>;
}

/** A rupee amount with tabular digits. The accessibility label always carries the final value. */
export const Amount = memo(function Amount({
  paise,
  variant = 'body',
  color = 'text',
  exact = false,
  animated = false,
  prefix = '',
  suffix = '',
  fit = false,
  style,
}: AmountProps) {
  const { reducedMotion } = useTheme();
  const shown = useCountUp(paise, { animate: animated && !reducedMotion });
  const format = exact ? formatINR : formatINRWhole;
  return (
    <AppText
      variant={variant}
      color={color}
      tabular
      style={style}
      accessibilityLabel={`${prefix}${format(paise)}${suffix}`}
      {...(fit ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.4 } : null)}
    >
      {prefix}
      {format(shown)}
      {suffix}
    </AppText>
  );
});
