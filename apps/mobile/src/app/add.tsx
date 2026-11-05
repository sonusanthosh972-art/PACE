import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CategoryGrid } from '@/components/CategoryGrid';
import { MoneyField, TextField } from '@/components/Fields';
import type { CategoryId } from '@/domain/categories';
import { addManualTransaction } from '@/services/actions';
import { invalidateAll } from '@/state/queries';
import { SPACE } from '@/theme/tokens';

/** Quick-add sheet for cash: amount, category, note. */
export default function AddSheet() {
  const client = useQueryClient();
  const [amount, setAmount] = useState<number | null>(null);
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!amount || amount <= 0) return setError('Enter how much you spent.');
    if (!category) return setError('Pick a category.');
    setSaving(true);
    try {
      await addManualTransaction({
        amountPaise: amount,
        category,
        note: note.trim() || null,
        merchant: note.trim() || null,
        occurredAt: Date.now(),
        mode: 'OTHER',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      await invalidateAll(client);
      router.back();
    } catch {
      setError('Could not save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.sheetHeader}>
        <AppText variant="title" accessibilityRole="header">
          Record cash spending
        </AppText>
        <AppText variant="caption" color="muted">
          Chai, auto, vegetables, tips. Adding cash keeps today&apos;s number honest.
        </AppText>
      </View>

      <View style={styles.section}>
        <MoneyField
          label="How much?"
          valuePaise={amount}
          onChangePaise={setAmount}
          large
          autoFocus
        />
      </View>

      <View style={styles.section}>
        <AppText variant="overline" color="muted" accessibilityRole="header">
          Category
        </AppText>
        <CategoryGrid selected={category} onSelect={setCategory} />
      </View>

      <View style={styles.section}>
        <TextField
          label="Note · optional"
          placeholder="Chai, auto, vegetables…"
          value={note}
          onChangeText={setNote}
          maxLength={120}
        />
      </View>

      {error ? (
        <AppText variant="caption" color="coralText" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}

      <View style={styles.actionWrap}>
        <Button label="Add spending" icon="checkmark" onPress={save} loading={saving} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACE.xl, gap: SPACE.lg, paddingBottom: SPACE.xxxl },
  sheetHeader: { gap: SPACE.xs },
  section: { gap: SPACE.sm },
  actionWrap: { paddingTop: SPACE.xs },
});
