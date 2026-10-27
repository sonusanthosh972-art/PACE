import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DayPicker, StepHeader } from '@/components/Controls';
import { MoneyField } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { getAppDb } from '@/data/appDb';
import { listTransactions } from '@/data/transactionsRepo';
import { formatINRWhole } from '@/domain/money';
import { parseSms } from '@/domain/parsing/parseSms';
import { detectSalaryCandidate, type SalaryCandidate } from '@/domain/salaryDetector';
import { ordinal } from '@/lib/format';
import { useOnboarding } from '@/state/onboardingStore';
import { SPACE } from '@/theme/tokens';
import * as SmsReader from '../../../modules/sms-reader';

export default function SalaryStep() {
  const { salaryPaise, payday, setSalary, setPayday } = useOnboarding();
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<SalaryCandidate | null>(null);

  useEffect(() => {
    let active = true;
    async function scan() {
      try {
        const db = await getAppDb();
        const txs = await listTransactions(db, { limit: 300 });
        let candidate = detectSalaryCandidate(txs);

        if (!candidate && SmsReader.isAvailable()) {
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
            candidate = detectSalaryCandidate(parsedList);
          }
        }

        if (active && candidate) {
          setDetected(candidate);
        }
      } catch {
        // Non-blocking background suggestion
      }
    }
    scan();
    return () => {
      active = false;
    };
  }, []);

  const next = () => {
    if (!salaryPaise || salaryPaise <= 0) {
      return setError('Please enter your monthly take-home amount to begin.');
    }
    setError(null);
    router.push('/onboarding/fixed');
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={<Button label="Continue to fixed bills" icon="arrow-forward" onPress={next} />}
    >
      <StepHeader
        step={1}
        total={4}
        title="Your monthly income"
        body="What actually reaches your bank account each month, after all taxes and deductions."
      />

      {detected && salaryPaise !== detected.salaryPaise ? (
        <Card style={styles.detectedCard}>
          <View style={styles.detectedRow}>
            <Icon name="sparkles" color="accentText" size={22} />
            <View style={styles.flex}>
              <AppText variant="caption" color="accentText">
                Detected from your bank credits
              </AppText>
              <AppText variant="bodyStrong">
                {formatINRWhole(detected.salaryPaise)} · {ordinal(detected.payday)} of month
              </AppText>
            </View>
            <Button
              label="Apply"
              compact
              variant="secondary"
              onPress={() => {
                setSalary(detected.salaryPaise);
                setPayday(detected.payday);
              }}
            />
          </View>
        </Card>
      ) : null}

      <MoneyField
        label="Monthly take-home income"
        valuePaise={salaryPaise}
        onChangePaise={setSalary}
        error={error}
        large
        autoFocus
        placeholder="1,00,000"
      />

      <Card style={styles.tipCard}>
        <View style={styles.tipRow}>
          <Icon name="heart-outline" color="accentText" size={20} />
          <AppText variant="caption" color="muted" style={styles.flex}>
            Whether you earn a salary, pension, or business revenue — enter the net amount you count
            on each month.
          </AppText>
        </View>
      </Card>

      <View style={styles.paydaySection}>
        <AppText variant="heading" accessibilityRole="header">
          When does your month refresh?
        </AppText>
        <AppText variant="caption" color="muted">
          Your budget cycle begins fresh on this date, making sure you always have enough to reach
          the next payday with confidence.
        </AppText>
        <DayPicker label="Payday" value={payday} onChange={setPayday} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  detectedCard: { marginBottom: SPACE.md, padding: SPACE.md },
  detectedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  tipCard: { marginTop: SPACE.xs, padding: SPACE.md },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  flex: { flex: 1 },
  paydaySection: { gap: SPACE.sm, marginTop: SPACE.md },
});
