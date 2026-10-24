import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { TransactionRow } from '@/components/TransactionRow';
import type { TxFilter } from '@/data/transactionsRepo';
import { cycleFor } from '@/domain/budget';
import { PICKABLE_CATEGORIES, type CategoryId } from '@/domain/categories';
import { addDays, startOfDayMs, toDateKey, type DateKey } from '@/domain/time';
import type { Mode, Transaction } from '@/domain/transaction';
import { formatDayLabel, MODE_LABELS } from '@/lib/format';
import { useTodayKey } from '@/lib/useTodayKey';
import { setTransactionExcluded } from '@/services/actions';
import { invalidateAll, useProfile, useTransactions } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, RADIUS, SPACE } from '@/theme/tokens';

type Range = 'cycle' | 'week' | 'all';
type ListItem =
  { type: 'header'; key: string; label: string } | { type: 'tx'; key: string; tx: Transaction };

const RANGES: { value: Range; label: string }[] = [
  { value: 'cycle', label: 'This cycle' },
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

  const today = useTodayKey();
  const filter = useMemo<TxFilter>(() => {
    const f: TxFilter = { limit: 2000 };
    if (range === 'cycle' && profile.data)
      f.from = startOfDayMs(cycleFor(today, profile.data.payday).start);
    if (range === 'week') f.from = startOfDayMs(addDays(today, -6));
    if (mode) f.mode = mode;
    if (category) f.category = category;
    if (search.trim()) f.search = search.trim();
    return f;
  }, [range, mode, category, search, today, profile.data]);

  const txs = useTransactions(filter);
  const items = useMemo(() => groupByDay(txs.data ?? [], today), [txs.data, today]);
  const filtersActive = Boolean(mode || category || search.trim() || range !== 'cycle');

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.top}>
        <AppText variant="title" accessibilityRole="header">
          Transactions
        </AppText>
        <TextField
          label="Search"
          placeholder="Merchant or note"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {RANGES.map((r) => (
            <Chip
              key={r.value}
              label={r.label}
              selected={range === r.value}
              onPress={() => setRange(r.value)}
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label="Needs a tag"
            selected={category === 'uncategorised'}
            onPress={() => setCategory(category === 'uncategorised' ? null : 'uncategorised')}
          />
          {PICKABLE_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={`${c.emoji} ${c.label}`}
              selected={category === c.id}
              onPress={() => setCategory(category === c.id ? null : c.id)}
            />
          ))}
        </ScrollView>
      </View>

      {txs.isPending ? (
        <View style={styles.pad}>
          <LoadingState rows={6} label="Loading transactions" />
        </View>
      ) : txs.isError ? (
        <ErrorState onRetry={() => txs.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={filtersActive ? 'search-outline' : 'receipt-outline'}
          title={filtersActive ? 'No matches' : 'No transactions yet'}
          body={
            filtersActive
              ? 'Try a different search or clear the filters.'
              : 'Bank SMS payments will appear here as they arrive.'
          }
          actionLabel={filtersActive ? 'Clear filters' : undefined}
          onAction={
            filtersActive
              ? () => {
                  setSearch('');
                  setRange('cycle');
                  setMode(null);
                  setCategory(null);
                }
              : undefined
          }
        />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <AppText
                variant="label"
                color="muted"
                style={styles.dayHeader}
                accessibilityRole="header"
              >
                {item.label}
              </AppText>
            ) : (
              <SwipeRow tx={item.tx} />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

function SwipeRow({ tx }: { tx: Transaction }) {
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
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg, gap: SPACE.md },
  chips: { gap: SPACE.sm, paddingRight: SPACE.xl, alignItems: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: 28, marginHorizontal: SPACE.xs },
  pad: { paddingHorizontal: SPACE.xl },
  listContent: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.xxxl, paddingTop: SPACE.sm },
  dayHeader: { marginTop: SPACE.lg, marginBottom: SPACE.sm },
  rowWrap: { marginBottom: SPACE.sm },
  actions: { flexDirection: 'row', gap: SPACE.sm, paddingLeft: SPACE.sm },
  action: {
    width: 84,
    minHeight: MIN_TOUCH,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
