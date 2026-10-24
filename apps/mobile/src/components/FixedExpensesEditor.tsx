import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { FixedExpenseInput } from '@/data/profileRepo';
import { formatINRWhole } from '@/domain/money';
import { ordinal } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, RADIUS, SPACE } from '@/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';
import { DayPicker } from './Controls';
import { MoneyField, TextField } from './Fields';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

const SUGGESTIONS = ['Rent', 'Home loan EMI', 'Car EMI', 'Insurance', 'SIP', 'Phone + internet'];

/** Add/remove fixed monthly costs (rent, EMIs, SIPs…). Pure UI over a list in props. */
export function FixedExpensesEditor({
  items,
  onChange,
}: {
  items: readonly FixedExpenseInput[];
  onChange: (items: FixedExpenseInput[]) => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [dueDay, setDueDay] = useState(5);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    if (!name.trim()) return setError('Give it a name, like "Rent".');
    if (!amount || amount <= 0) return setError('Enter the monthly amount.');
    onChange([...items, { name: name.trim(), amountPaise: amount, dueDay }]);
    setName('');
    setAmount(null);
    setError(null);
    setFormKey((k) => k + 1); // resets the money field
  };

  return (
    <View style={styles.wrap}>
      {items.map((item, index) => (
        <View
          key={`${item.name}-${index}`}
          style={[styles.item, { backgroundColor: colors.surface }]}
          accessible
          accessibilityLabel={`${item.name}, ${formatINRWhole(item.amountPaise)}, due on the ${ordinal(item.dueDay)}`}
        >
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{item.name}</AppText>
            <AppText variant="caption" color="muted">
              Due on the {ordinal(item.dueDay)}
            </AppText>
          </View>
          <AppText variant="bodyStrong" tabular>
            {formatINRWhole(item.amountPaise)}
          </AppText>
          <PressableScale
            onPress={() => onChange(items.filter((_, i) => i !== index))}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name}`}
            style={styles.remove}
          >
            <Icon name="close-circle-outline" color="muted" />
          </PressableScale>
        </View>
      ))}

      <View style={[styles.form, { borderColor: colors.border }]}>
        <AppText variant="heading">Add a fixed cost</AppText>
        <View style={styles.suggestions}>
          {SUGGESTIONS.filter((s) => !items.some((i) => i.name === s)).map((s) => (
            <PressableScale
              key={s}
              onPress={() => setName(s)}
              accessibilityRole="button"
              accessibilityLabel={`Use name ${s}`}
              style={[styles.suggestion, { borderColor: colors.border }]}
            >
              <AppText variant="caption" color="muted">
                {s}
              </AppText>
            </PressableScale>
          ))}
        </View>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="Rent" />
        <MoneyField
          key={formKey}
          label="Monthly amount"
          valuePaise={amount}
          onChangePaise={setAmount}
        />
        <AppText variant="label">Due day</AppText>
        <DayPicker label="Due day of the month" value={dueDay} onChange={setDueDay} />
        {error ? (
          <AppText variant="caption" color="coralText" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
        <Button label="Add" icon="add" variant="secondary" onPress={add} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: RADIUS.md,
  },
  flex: { flex: 1 },
  remove: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  form: {
    gap: SPACE.md,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    borderStyle: 'dashed',
  },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  suggestion: {
    minHeight: 36,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
