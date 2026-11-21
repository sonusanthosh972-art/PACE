import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader, HeaderBackground, TAB_GUTTER } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { TransactionRow } from '@/components/TransactionRow';
import type { TxFilter } from '@/data/transactionsRepo';
import { CATEGORIES, PICKABLE_CATEGORIES, type CategoryId } from '@/domain/categories';
import { addDays, startOfDayMs, toDateKey, type DateKey } from '@/domain/time';
import type { Mode, Transaction } from '@/domain/transaction';
import { formatDayLabel, MODE_LABELS } from '@/lib/format';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useTodayKey } from '@/lib/useTodayKey';
import { setTransactionExcluded } from '@/services/actions';
import { defaultTxFilter, invalidateAll, useProfile, useTransactions } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { COLORS, FONT, ICON, MIN_TOUCH, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

type Range = 'cycle' | 'week' | 'all';
type ListItem =
  { type: 'header'; key: string; label: string } | { type: 'tx'; key: string; tx: Transaction };

const RANGES: { value: Range; label: string }[] = [
  { value: 'cycle', label: 'This month' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'all', label: 'All' },
];
const MODES: Mode[] = ['UPI', 'CARD', 'ATM', 'AUTOPAY', 'IMPS', 'NEFT'];

function groupByDay(txs: readonly Transaction[], today: DateKey): ListItem[] {
  const items: ListItem[] = [];
  let current: DateKey | null = null;
  for (const tx of txs) {
    const day = toDateKey(tx.occurredAt);
    if (day !== current) {
      current = day;
      items.push({ type: 'header', key: `h-${day}`, label: formatDayLabel(day, today) });
    }
    items.push({ type: 'tx', key: tx.id, tx });
  }
  return items;
}

export default function TransactionsScreen() {
  const { colors } = useTheme();
  const profile = useProfile();
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<Range>('cycle');
  const [mode, setMode] = useState<Mode | null>(null);
  const [category, setCategory] = useState<CategoryId | null>(null);

  // Opened from a Today tile (?category=food&at=…): apply that filter once per tap. `at` makes
  // a repeat tap on the same tile a new link, so it re-applies after the filters were reset.
  const params = useLocalSearchParams<{ category?: string; at?: string }>();
  const linkKey = params.category ? `${params.category}:${params.at ?? ''}` : undefined;
  const [appliedLink, setAppliedLink] = useState<string | undefined>(undefined);
  if (linkKey !== appliedLink) {
    setAppliedLink(linkKey);
    if (params.category && params.category in CATEGORIES) {
      setCategory(params.category as CategoryId);
    }
  }

  const today = useTodayKey();
  // Query once typing pauses, not on every key press.
  const searchQuery = useDebouncedValue(search.trim(), 250);
  const filter = useMemo<TxFilter>(() => {
    // Same opening filter as the background prefetch, so a first visit finds its data ready.
    const f: TxFilter =
      range === 'cycle' ? defaultTxFilter(today, profile.data?.payday ?? null) : { limit: 2000 };
    if (range === 'week') f.from = startOfDayMs(addDays(today, -6));
    if (mode) f.mode = mode;
    if (category) f.category = category;
    if (searchQuery) f.search = searchQuery;
    return f;
  }, [range, mode, category, searchQuery, today, profile.data]);

  const txs = useTransactions(filter);
  const items = useMemo(() => groupByDay(txs.data ?? [], today), [txs.data, today]);
  const filtersActive = Boolean(mode || category || search.trim() || range !== 'cycle');
  const [pickingRange, setPickingRange] = useState(false);
  const scrollY = useSharedValue(0);

  const resetFilters = () => {
    setSearch('');
    setRange('cycle');
    setMode(null);
    setCategory(null);
  };

  // Header, search and filters scroll away with the list, like the Today screen; the city image
  // behind them follows the same scroll.
  const header = useMemo(
    () => (
      <View style={styles.top}>
        <AppHeader page="transactions" title="Transactions" hint="Your recent spending" />
        {/* 1. Integrated Search Bar */}
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Icon name="search-outline" size={ICON.sm} color="muted" />
          <TextInput
            placeholder="Search by name or note"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.text }]}
            accessibilityLabel="Search by merchant or note"
          />
          {search.length > 0 ? (
            <PressableScale
              onPress={() => setSearch('')}
              accessibilityLabel="Clear search input"
              style={styles.clearSearchBtn}
            >
              <Icon name="close-circle" size={ICON.md} color="muted" />
            </PressableScale>
          ) : null}
        </View>

        {/* 3. Horizontal Filter Chips (Category & Payment Mode) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}
        >
          <PressableScale
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              setPickingRange(true);
            }}
            style={[styles.rangeChip, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel={`Showing ${RANGES.find((r) => r.value === range)?.label}. Change the time range.`}
          >
            <AppText variant="label" style={{ color: colors.onAccent }}>
              {RANGES.find((r) => r.value === range)?.label}
            </AppText>
            <Icon name="chevron-down" size={ICON.sm} tint={colors.onAccent} />
          </PressableScale>

          {filtersActive ? (
            <PressableScale
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                resetFilters();
              }}
              style={[
                styles.resetChip,
                {
                  borderColor: colors.accent,
                  backgroundColor: withAlpha(colors.accent, 0.08),
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Reset all filters"
            >
              <Icon name="refresh-outline" size={ICON.sm} color="accentText" />
              <AppText variant="label" color="accentText">
                Reset
              </AppText>
            </PressableScale>
          ) : null}

          <Chip
            label="Needs a tag"
            icon="pricetag-outline"
            tint={colors.amberText}
            selected={category === 'uncategorised'}
            onPress={() => setCategory(category === 'uncategorised' ? null : 'uncategorised')}
          />

          {PICKABLE_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={c.shortLabel}
              accessibilityLabel={c.label}
              icon={c.icon as IconName}
              tint={colors.categories[c.id]}
              selected={category === c.id}
              onPress={() => setCategory(category === c.id ? null : c.id)}
            />
          ))}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {MODES.map((m) => (
            <Chip
              key={m}
              label={MODE_LABELS[m]}
              selected={mode === m}
              onPress={() => setMode(mode === m ? null : m)}
            />
          ))}
        </ScrollView>
      </View>
    ),
    [colors, search, range, filtersActive, category, mode],
  );

  const emptyState = txs.isPending ? (
    <LoadingState label="Loading transactions" />
  ) : txs.isError ? (
    <ErrorState onRetry={() => txs.refetch()} />
  ) : (
    <EmptyState
      icon={filtersActive ? 'search-outline' : 'receipt-outline'}
      title={filtersActive ? 'No matching payments found' : 'Your spending history is clear'}
      body={
        filtersActive
          ? 'Try adjusting your search terms or reset the filters to see all payments.'
          : 'Payments from bank SMS alerts and UPI will appear here automatically. Paid in cash? Add it in seconds.'
      }
      actionLabel={filtersActive ? 'Clear filters' : undefined}
      onAction={filtersActive ? resetFilters : undefined}
    />
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) =>
      item.type === 'header' ? (
        <View style={styles.dayHeaderWrap}>
          <AppText variant="label" color="muted" accessibilityRole="header">
            {item.label}
          </AppText>
        </View>
      ) : (
        <SwipeRow tx={item.tx} />
      ),
    [],
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
      <HeaderBackground scrollY={scrollY} />
      <FlashList
        data={txs.isPending || txs.isError ? [] : items}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        ListHeaderComponent={header}
        ListEmptyComponent={emptyState}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          scrollY.set(e.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
        renderItem={renderItem}
      />
      <PressableScale
        onPress={() => router.push('/add')}
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        accessibilityHint="Opens a quick form to record a cash payment"
        style={[styles.fab, { backgroundColor: colors.primary }]}
        testID="add-fab"
      >
        <Icon name="add" size={28} tint={colors.onAccent} />
      </PressableScale>
      <Modal
        visible={pickingRange}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPickingRange(false)}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          onPress={() => setPickingRange(false)}
          accessibilityLabel="Close"
        >
          <View
            style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}
            accessibilityRole="radiogroup"
            accessibilityLabel="Time range"
          >
            {RANGES.map((r) => {
              const selected = r.value === range;
              return (
                <PressableScale
                  key={r.value}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setRange(r.value);
                    setPickingRange(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={r.label}
                  style={[
                    styles.menuRow,
                    selected && { backgroundColor: withAlpha(colors.primary, 0.14) },
                  ]}
                >
                  <AppText variant="bodyStrong" style={styles.flex}>
                    {r.label}
                  </AppText>
                  {selected ? <Icon name="checkmark" size={ICON.md} tint={colors.primary} /> : null}
                </PressableScale>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const SwipeRow = memo(function SwipeRow({ tx }: { tx: Transaction }) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const openDetails = () => router.push(`/transaction/${tx.id}`);
  const toggleExcluded = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    await setTransactionExcluded(tx.id, !tx.isExcluded);
    await invalidateAll(client);
  };

  return (
    <View
      style={styles.rowWrap}
      accessibilityActions={[
        { name: 'recategorise', label: 'Change category' },
        {
          name: 'exclude',
          label: tx.isExcluded ? 'Count as an expense' : 'Mark as not an expense',
        },
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'recategorise') openDetails();
        if (e.nativeEvent.actionName === 'exclude') toggleExcluded().catch(() => undefined);
      }}
    >
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={48}
        overshootRight={false}
        renderRightActions={(_progress, _translation, methods) => (
          <View style={styles.actions}>
            <PressableScale
              onPress={() => {
                methods.close();
                openDetails();
              }}
              accessibilityLabel="Change category"
              style={[styles.action, { backgroundColor: colors.elevated }]}
            >
              <Icon name="pricetag-outline" color="text" />
              <AppText variant="caption">Category</AppText>
            </PressableScale>
            <PressableScale
              onPress={() => {
                methods.close();
                toggleExcluded().catch(() => undefined);
              }}
              accessibilityLabel={tx.isExcluded ? 'Count as an expense' : 'Not an expense'}
              style={[styles.action, { backgroundColor: colors.elevated }]}
            >
              <Icon
                name={tx.isExcluded ? 'add-circle-outline' : 'remove-circle-outline'}
                color="amberText"
              />
              <AppText variant="caption">{tx.isExcluded ? 'Count it' : 'Not expense'}</AppText>
            </PressableScale>
          </View>
        )}
      >
        <TransactionRow tx={tx} onPress={openDetails} />
      </ReanimatedSwipeable>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  // The list supplies the side padding; the header only adds the top space Today has.
  top: { paddingTop: SPACE.xl, gap: SPACE.lg, paddingBottom: SPACE.xs },

  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: SPACE.md,
    gap: SPACE.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 15,
    paddingVertical: SPACE.sm,
  },
  // 20pt icon + padding ≈ the 48dp touch target without making the bar taller.
  clearSearchBtn: {
    padding: SPACE.md,
    marginRight: -SPACE.md,
  },

  flex: { flex: 1 },
  rangeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    minHeight: 40,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.pill,
  },
  fab: {
    position: 'absolute',
    right: TAB_GUTTER,
    bottom: SPACE.xl,
    width: 58,
    height: 58,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 6px 16px ${COLORS.atmosphere.shadow}`,
  },
  backdrop: { flex: 1, justifyContent: 'center', padding: SPACE.xl },
  menu: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACE.sm },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH + SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
  },

  // Chips
  // The chip row runs edge to edge, starting in line with the rest of the content.
  chipsScroll: { marginHorizontal: -TAB_GUTTER },
  chips: {
    gap: SPACE.xs,
    paddingHorizontal: TAB_GUTTER,
    alignItems: 'center',
  },
  resetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    minHeight: MIN_TOUCH,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    marginHorizontal: SPACE.xs,
  },

  listContent: {
    paddingHorizontal: TAB_GUTTER,
    // Room under the last row for the add button.
    paddingBottom: SPACE.xxxl + 56,
  },
  dayHeaderWrap: {
    marginTop: SPACE.lg,
    marginBottom: SPACE.sm,
  },
  rowWrap: {
    marginBottom: SPACE.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACE.sm,
    paddingLeft: SPACE.sm,
  },
  action: {
    width: 84,
    minHeight: MIN_TOUCH,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
