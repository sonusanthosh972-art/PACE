import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { TAB_PAGES, type TabPage } from './tabPages';

/**
 * Which page this is, in the tab's own icon and name (e.g. "⌂ TODAY"), so it is obvious at a
 * glance which tab you are on.
 */
export function PageChip({ page }: { page: TabPage }) {
  const { colors } = useTheme();
  const { label, icon } = TAB_PAGES[page];
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: withAlpha(colors.accent, 0.16),
          borderColor: withAlpha(colors.accent, 0.4),
        },
      ]}
      accessible
      accessibilityLabel={`${label} page`}
    >
      <Icon name={icon} size={ICON.sm} tint={colors.accent} />
      <AppText variant="overline" style={{ color: colors.accent }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.sm + SPACE.xs / 2,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    marginBottom: SPACE.xs / 2,
  },
});
