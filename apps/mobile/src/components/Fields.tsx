import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { parseRupeesToPaise } from '@/domain/money';
import { sanitiseAmountInput } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, MIN_TOUCH, RADIUS, SPACE, TYPE } from '@/theme/tokens';

import { AppText } from './AppText';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}

function FieldShell({ label, hint, error, children }: FieldShellProps) {
  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>
      {children}
      {error ? (
        <AppText variant="caption" color="coralText" accessibilityRole="alert">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  error?: string | null;
}

export function TextField({ label, hint, error, ...input }: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          TYPE.body,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.coral : focused ? colors.accent : colors.border,
          },
        ]}
        {...input}
      />
    </FieldShell>
  );
}

interface MoneyFieldProps {
  label: string;
  valuePaise: number | null;
  onChangePaise: (paise: number | null) => void;
  hint?: string;
  error?: string | null;
  large?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

/** Rupee input that hands back integer paise (or null when empty/invalid). */
export function MoneyField({
  label,
  valuePaise,
  onChangePaise,
  hint,
  error,
  large = false,
  autoFocus,
  placeholder = '0',
}: MoneyFieldProps) {
  const { colors } = useTheme();
  const [text, setText] = useState(() =>
    valuePaise === null
      ? ''
      : valuePaise % 100 === 0
        ? String(valuePaise / 100)
        : `${Math.trunc(valuePaise / 100)}.${String(valuePaise % 100).padStart(2, '0')}`,
  );
  const [focused, setFocused] = useState(false);

  return (
    <FieldShell label={label} hint={hint} error={error}>
      <View
        style={[
          styles.moneyRow,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.coral : focused ? colors.accent : colors.border,
          },
        ]}
      >
        <AppText variant={large ? 'title' : 'bodyStrong'} color="muted">
          ₹
        </AppText>
        <TextInput
          accessibilityLabel={`${label}, in rupees`}
          value={text}
          autoFocus={autoFocus}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChangeText={(raw) => {
            const next = sanitiseAmountInput(raw);
            setText(next);
            onChangePaise(next === '' ? null : parseRupeesToPaise(next));
          }}
          style={[
            styles.moneyInput,
            large ? TYPE.title : TYPE.bodyStrong,
            { color: colors.text, fontFamily: FONT.semibold, fontVariant: ['tabular-nums'] },
          ]}
        />
      </View>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  field: { gap: SPACE.sm },
  input: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: SPACE.lg,
  },
  moneyRow: {
    minHeight: MIN_TOUCH + 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  moneyInput: { flex: 1, paddingVertical: SPACE.sm },
});
