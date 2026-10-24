import { Text, type TextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { TYPE, type Palette, type TypeVariant } from '@/theme/tokens';

export type TextColor = keyof Pick<
  Palette,
  'text' | 'muted' | 'accentText' | 'amberText' | 'coralText' | 'onAccent' | 'accent'
>;

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: TextColor;
  /** Tabular figures so digits do not jump while numbers animate. */
  tabular?: boolean;
  center?: boolean;
}

/** All text in the app. Respects system font scaling (capped so layouts stay usable). */
export function AppText({
  variant = 'body',
  color = 'text',
  tabular = false,
  center = false,
  style,
  maxFontSizeMultiplier,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? (variant === 'hero' ? 1.4 : 2)}
      style={[
        TYPE[variant],
        { color: colors[color] },
        tabular && { fontVariant: ['tabular-nums'] },
        center && { textAlign: 'center' },
        style,
      ]}
      {...rest}
    />
  );
}
