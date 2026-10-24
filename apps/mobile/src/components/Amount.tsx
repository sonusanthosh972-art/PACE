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
}

/** A rupee amount with tabular digits. The accessibility label always carries the final value. */
export function Amount({
  paise,
  variant = 'body',
  color = 'text',
  exact = false,
  animated = false,
  prefix = '',
  suffix = '',
}: AmountProps) {
  const { reducedMotion } = useTheme();
  const shown = useCountUp(paise, { animate: animated && !reducedMotion });
  const format = exact ? formatINR : formatINRWhole;
  return (
    <AppText
      variant={variant}
      color={color}
      tabular
      accessibilityLabel={`${prefix}${format(paise)}${suffix}`}
    >
      {prefix}
      {format(shown)}
      {suffix}
    </AppText>
  );
}
