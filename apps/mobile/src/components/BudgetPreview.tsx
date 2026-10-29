import { StyleSheet, View } from 'react-native';

import { cycleFor, dailyAllowance, spendableForCycle, type BudgetProfile } from '@/domain/budget';
import { formatINRWhole } from '@/domain/money';
import { useTodayKey } from '@/lib/useTodayKey';
import { useTheme } from '@/theme/ThemeProvider';
import { RADIUS, SPACE } from '@/theme/tokens';

import { AppText } from './AppText';

/** Live "what this means" preview: spendable per cycle and per day, as it stands today. */
export function BudgetPreview({ profile }: { profile: BudgetProfile }) {
  const { colors } = useTheme();
  const spendable = spendableForCycle(profile);
  const today = useTodayKey();
  const cycle = cycleFor(today, profile.payday);
  // Exactly what the Today screen will show each day of this cycle.
  const perDay = dailyAllowance(profile, cycle);

  return (
    <View
      style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={
        spendable <= 0
          ? 'Your fixed costs and savings use up the whole salary. Lower one of them to get a daily budget.'
          : `About ${formatINRWhole(perDay)} a day to spend. ${formatINRWhole(spendable)} a month after fixed costs and savings.`
      }
    >
      {spendable <= 0 ? (
        <AppText color="coralText">
          Fixed costs and savings use up the whole salary. Lower one of them to get a daily budget.
        </AppText>
      ) : (
        <>
          <AppText variant="caption" color="muted">
            That leaves you
          </AppText>
          <AppText
            variant="title"
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {formatINRWhole(perDay)} / day
          </AppText>
          <AppText variant="caption" color="muted" tabular>
            {formatINRWhole(spendable)} a month to spend · {cycle.totalDays} days this cycle
          </AppText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACE.lg, gap: SPACE.xs },
});
