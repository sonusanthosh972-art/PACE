import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BudgetPreview } from '@/components/BudgetPreview';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { StepHeader } from '@/components/Controls';
import { MoneyField } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { useOnboarding } from '@/state/onboardingStore';
import { SPACE } from '@/theme/tokens';

export default function SavingsStep() {
  const { salaryPaise, payday, fixedExpenses, savingsGoalPaise, setSavingsGoal } = useOnboarding();

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <Button
          label="See my private permissions"
          icon="arrow-forward"
          onPress={() => router.push('/onboarding/permissions')}
        />
      }
    >
      <StepHeader
        step={3}
        total={4}
        title="Pay your future self"
        body="Set aside money for emergencies, dreams, or future peace. This is kept safe outside your daily spending."
      />

      <MoneyField
        label="Monthly savings goal"
        valuePaise={savingsGoalPaise}
        onChangePaise={setSavingsGoal}
        large
        placeholder="10,000"
      />

      <Card style={styles.savingsTip}>
        <View style={styles.tipRow}>
          <Icon name="trending-up-outline" color="accentText" size={20} />
          <AppText variant="caption" color="muted" style={styles.flex}>
            Paying yourself first turns savings into a habit rather than an afterthought. Even a
            modest start creates immense peace of mind.
          </AppText>
        </View>
      </Card>

      <View style={styles.previewWrap}>
        <AppText variant="heading" accessibilityRole="header">
          Your daily financial pace
        </AppText>
        <BudgetPreview
          profile={{
            monthlySalaryPaise: salaryPaise ?? 0,
            payday,
            monthlySavingsGoalPaise: savingsGoalPaise ?? 0,
            fixedExpenses: fixedExpenses.map((f, i) => ({ ...f, id: String(i) })),
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  savingsTip: { marginTop: SPACE.xs, padding: SPACE.md },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  flex: { flex: 1 },
  previewWrap: { gap: SPACE.sm, marginTop: SPACE.md },
});
