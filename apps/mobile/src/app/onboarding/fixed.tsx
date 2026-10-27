import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { StepHeader } from '@/components/Controls';
import { FixedExpensesEditor } from '@/components/FixedExpensesEditor';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { getAppDb } from '@/data/appDb';
import { listTransactions } from '@/data/transactionsRepo';
import { parseSms } from '@/domain/parsing/parseSms';
import { detectSubscriptions, type DetectedSubscription } from '@/domain/subscriptions';
import { useOnboarding } from '@/state/onboardingStore';
import { SPACE } from '@/theme/tokens';
import * as SmsReader from '../../../modules/sms-reader';

export default function FixedStep() {
  const { fixedExpenses, setFixedExpenses } = useOnboarding();
  const [suggested, setSuggested] = useState<DetectedSubscription[]>([]);
  const hasItems = fixedExpenses.length > 0;

  useEffect(() => {
    let active = true;
    async function scan() {
      try {
        const db = await getAppDb();
        const txs = await listTransactions(db, { limit: 300 });
        let subs = detectSubscriptions(txs);

        if (subs.length === 0 && SmsReader.isAvailable()) {
          const perm = await SmsReader.getSmsPermissions();
          if (perm.granted) {
            const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
            const items = await SmsReader.readBankSms(ninetyDaysAgo);
            const parsedList = items.flatMap((it) => {
              if (it.kind === 'sms') {
                const p = parseSms(it.sender, it.body, it.receivedAt);
                return p ? [p] : [];
              }
              return [];
            });
            subs = detectSubscriptions(parsedList);
          }
        }

        if (active && subs.length > 0) {
          setSuggested(subs);
        }
      } catch {
        // Non-blocking suggestion
      }
    }
    scan();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <Button
          label={hasItems ? 'Lock essentials & continue' : 'No fixed bills · Skip'}
          variant={hasItems ? 'primary' : 'secondary'}
          icon={hasItems ? 'arrow-forward' : undefined}
          onPress={() => router.push('/onboarding/savings')}
        />
      }
    >
      <StepHeader
        step={2}
        total={4}
        title="Protect your essentials"
        body="Rent, EMIs, school fees, utilities, or parents' allowance. We lock these away so they are never touched."
      />

      <Card style={styles.reassuranceCard}>
        <View style={styles.cardRow}>
          <Icon name="shield-outline" color="accentText" size={20} />
          <AppText variant="caption" color="muted" style={styles.flex}>
            When your vital commitments are protected in advance, every remaining rupee in your
            daily budget is completely safe to spend with zero guilt.
          </AppText>
        </View>
      </Card>

      <FixedExpensesEditor
        items={fixedExpenses}
        onChange={setFixedExpenses}
        suggestedSubscriptions={suggested}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  reassuranceCard: { marginBottom: SPACE.sm, padding: SPACE.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  flex: { flex: 1 },
});
