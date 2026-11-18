import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CategoryGrid } from '@/components/CategoryGrid';
import { MoneyField, TextField } from '@/components/Fields';
import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import {
  comparePurchaseAmounts,
  simulatePurchase,
  type AffordabilityTier,
  type ComparisonItem,
} from '@/domain/afford';
import type { CategoryId } from '@/domain/categories';
import { formatINRWhole, type Paise } from '@/domain/money';
import { addManualTransaction } from '@/services/actions';
import { invalidateAll, useProfile, useToday } from '@/state/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { RADIUS, SPACE, type Palette } from '@/theme/tokens';

type ViewMode = 'single' | 'compare';

const QUICK_PRESETS: { label: string; paise: Paise }[] = [
  { label: '₹500', paise: 50000 },
  { label: '₹1,500', paise: 150000 },
  { label: '₹3,000', paise: 300000 },
  { label: '₹5,000', paise: 500000 },
  { label: '₹10,000', paise: 1000000 },
];

export default function AffordScreen() {
  const { colors } = useTheme();
  const profileQuery = useProfile();
  const todayQuery = useToday();
  const client = useQueryClient();

  const [mode, setMode] = useState<ViewMode>('single');
  const [amountPaise, setAmountPaise] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CategoryId>('shopping');
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);

  // Multi-option comparison amounts
  const [compOptionA, setCompOptionA] = useState<number | null>(150000); // ₹1,500
  const [compOptionB, setCompOptionB] = useState<number | null>(350000); // ₹3,500
  const [compOptionC, setCompOptionC] = useState<number | null>(750000); // ₹7,500

  const profile = profileQuery.data;
  const todayData = todayQuery.data;

  // Single simulation calculation
  const simulation = useMemo(() => {
    if (!profile || !todayData) return null;
    const purchase = amountPaise ?? 0;
    return simulatePurchase({
      purchasePaise: purchase,
      profile,
      snapshot: todayData.snapshot,
      today: todayData.today,
    });
  }, [profile, todayData, amountPaise]);

  // Comparison calculation
  const comparisonResults = useMemo<ComparisonItem[]>(() => {
    if (!profile || !todayData) return [];
    const candidates = [
      { id: 'optA', label: 'Option A', amountPaise: compOptionA ?? 0 },
      { id: 'optB', label: 'Option B', amountPaise: compOptionB ?? 0 },
      { id: 'optC', label: 'Option C', amountPaise: compOptionC ?? 0 },
    ].filter((c) => c.amountPaise > 0);

    if (candidates.length === 0) return [];

    return comparePurchaseAmounts({
      amounts: candidates,
      profile,
      snapshot: todayData.snapshot,
      today: todayData.today,
    });
  }, [profile, todayData, compOptionA, compOptionB, compOptionC]);

  if (profileQuery.isPending || todayQuery.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading your budget snapshot…" />
      </Screen>
    );
  }

  if (profileQuery.isError || todayQuery.isError || !profile || !todayData) {
    return (
      <Screen>
        <ErrorState
          title="Could not load budget data"
          body="Please make sure your salary and budget profile are configured in Settings."
          onRetry={() => {
            profileQuery.refetch();
            todayQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const handleConfirmPurchase = async () => {
    if (!amountPaise || amountPaise <= 0) {
      Alert.alert('Invalid amount', 'Please enter a purchase amount greater than zero.');
      return;
    }

    // Idempotent client transaction ID
    const purchaseId =
      confirmedId ?? `sim_purchase_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setConfirmedId(purchaseId);
    setIsConfirming(true);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

      await addManualTransaction({
        id: purchaseId,
        amountPaise,
        category,
        merchant: description.trim() || 'Simulated Purchase',
        note: description.trim()
          ? `Simulated: ${description.trim()}`
          : 'Confirmed from Purchase Simulator',
        occurredAt: Date.now(),
        mode: 'OTHER',
      });

      await invalidateAll(client);

      Alert.alert(
        'Purchase Recorded',
        `${formatINRWhole(amountPaise)} for "${description.trim() || 'Simulated Purchase'}" has been deducted from your daily budget and logged.`,
        [
          {
            text: 'View Today',
            onPress: () => router.replace('/(tabs)'),
          },
        ],
      );
    } catch {
      Alert.alert('Error', 'Could not record the purchase. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleApplyPreset = (paise: Paise) => {
    Haptics.selectionAsync().catch(() => undefined);
    setAmountPaise(paise);
  };

  return (
    <Screen>
      {/* 1. Navigation & Header */}
      <View style={styles.header}>
        <PressableScale
          onPress={() => router.back()}
          style={[styles.backButton, { borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="chevron-back" size={20} color="text" />
        </PressableScale>
        <View style={styles.headerText}>
          <AppText variant="title" accessibilityRole="header">
            Can I afford this?
          </AppText>
          <AppText variant="caption" color="muted">
            Simulate a purchase to see its immediate and lasting budget impact.
          </AppText>
        </View>
      </View>

      {/* 2. Mode Selector: Single Purchase vs Compare Options */}
      <View
        style={[
          styles.segmentedWrap,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <PressableScale
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setMode('single');
          }}
          style={[
            styles.segmentButton,
            mode === 'single' && [
              styles.segmentActive,
              { backgroundColor: colors.elevated, borderColor: colors.accent },
            ],
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'single' }}
          accessibilityLabel="Single purchase simulation"
        >
          <AppText variant="label" color={mode === 'single' ? 'text' : 'muted'}>
            Single Purchase
          </AppText>
        </PressableScale>
        <PressableScale
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setMode('compare');
          }}
          style={[
            styles.segmentButton,
            mode === 'compare' && [
              styles.segmentActive,
              { backgroundColor: colors.elevated, borderColor: colors.accent },
            ],
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'compare' }}
          accessibilityLabel="Compare multiple amounts"
        >
          <AppText variant="label" color={mode === 'compare' ? 'text' : 'muted'}>
            Compare Options
          </AppText>
        </PressableScale>
      </View>

      {/* ==================== SINGLE PURCHASE MODE ==================== */}
      {mode === 'single' ? (
        <View style={styles.modeContent}>
          {/* Primary Input Card */}
          <View
            style={[
              styles.inputCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <MoneyField
              label="Planned purchase amount"
              valuePaise={amountPaise}
              onChangePaise={setAmountPaise}
              large
              autoFocus
            />

            {/* Quick Amount Presets */}
            <View style={styles.presetsRow}>
              <AppText variant="caption" color="muted" style={styles.presetLabel}>
                QUICK:
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetsScroll}
              >
                {QUICK_PRESETS.map((preset) => (
                  <PressableScale
                    key={preset.label}
                    onPress={() => handleApplyPreset(preset.paise)}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor:
                          amountPaise === preset.paise ? `${colors.accent}20` : colors.elevated,
                        borderColor: amountPaise === preset.paise ? colors.accent : colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Set amount to ${preset.label}`}
                  >
                    <AppText
                      variant="caption"
                      color={amountPaise === preset.paise ? 'accentText' : 'muted'}
                      style={styles.presetText}
                    >
                      {preset.label}
                    </AppText>
                  </PressableScale>
                ))}
              </ScrollView>
            </View>

            <TextField
              label="Item or description (optional)"
              placeholder="e.g. Headphones, Weekend Trip, New Shoes"
              value={description}
              onChangeText={setDescription}
              maxLength={80}
            />

            <View style={styles.categoryWrap}>
              <AppText variant="caption" color="muted" style={styles.sectionLabel}>
                CATEGORY
              </AppText>
              <CategoryGrid selected={category} onSelect={setCategory} />
            </View>
          </View>

          {/* If amount is 0 or empty: Educational Helper State */}
          {!amountPaise || amountPaise <= 0 ? (
            <View
              style={[
                styles.guidanceCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.guidanceHeader}>
                <Icon name="sparkles-outline" size={20} color="accent" />
                <AppText variant="bodyStrong">How simulation protects your money</AppText>
              </View>
              <AppText variant="caption" color="muted" style={styles.guidanceBody}>
                Before making a non-essential purchase, test how it ripples through the rest of your
                salary cycle. We check your remaining pool, protected savings, and upcoming bills.
              </AppText>
              <View style={styles.statPills}>
                <View style={[styles.statPill, { backgroundColor: colors.elevated }]}>
                  <AppText variant="caption" color="muted">
                    Remaining Pool
                  </AppText>
                  <AppText variant="bodyStrong">
                    {formatINRWhole(simulation?.projection.currentCycleBalancePaise ?? 0)}
                  </AppText>
                </View>
                <View style={[styles.statPill, { backgroundColor: colors.elevated }]}>
                  <AppText variant="caption" color="muted">
                    Days to Payday
                  </AppText>
                  <AppText variant="bodyStrong">{simulation?.daysLeft ?? 0} days</AppText>
                </View>
                <View style={[styles.statPill, { backgroundColor: colors.elevated }]}>
                  <AppText variant="caption" color="muted">
                    Bills Reserved
                  </AppText>
                  <AppText variant="bodyStrong">
                    {formatINRWhole(simulation?.upcomingBills.totalFixedPaise ?? 0)}
                  </AppText>
                </View>
              </View>
            </View>
          ) : simulation ? (
            /* Simulation Outcome & Analysis */
            <View style={styles.resultsWrap}>
              {/* Outcome Banner */}
              <OutcomeBanner
                tier={simulation.tier}
                recommendation={simulation.recommendation}
                colors={colors}
              />

              {/* Before and After Comparison Grid */}
              <View
                style={[
                  styles.comparisonGrid,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <AppText variant="caption" color="muted" style={styles.gridTitle}>
                  BEFORE & AFTER PROJECTION
                </AppText>

                {/* Metric 1: Daily Safe-to-Spend */}
                <View style={styles.metricRow}>
                  <View style={styles.metricInfo}>
                    <AppText variant="bodyStrong">Daily safe-to-spend</AppText>
                    <AppText variant="caption" color="muted">
                      For remaining {simulation.daysLeft} days
                    </AppText>
                  </View>
                  <View style={styles.metricValues}>
                    <View style={styles.metricBox}>
                      <AppText variant="caption" color="muted">
                        Before
                      </AppText>
                      <AppText variant="bodyStrong" tabular>
                        {formatINRWhole(simulation.projection.currentDailySafeToSpendPaise)}
                      </AppText>
                    </View>
                    <Icon name="arrow-forward" size={16} color="muted" />
                    <View style={styles.metricBox}>
                      <AppText variant="caption" color={getTierColorName(simulation.tier)}>
                        After
                      </AppText>
                      <AppText
                        variant="bodyStrong"
                        tabular
                        color={getTierColorName(simulation.tier)}
                      >
                        {formatINRWhole(simulation.projection.projectedDailySafeToSpendPaise)}
                      </AppText>
                    </View>
                  </View>
                </View>

                {simulation.projection.dailyReductionPercent > 0 ? (
                  <View style={styles.deltaPillRow}>
                    <View
                      style={[
                        styles.deltaPill,
                        {
                          backgroundColor:
                            simulation.tier === 'SAFE'
                              ? `${colors.accent}18`
                              : simulation.tier === 'CAUTION'
                                ? `${colors.amber}18`
                                : `${colors.coral}18`,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        color={getTierColorName(simulation.tier)}
                        style={styles.deltaText}
                      >
                        ↓ {simulation.projection.dailyReductionPercent}% daily allowance reduction (
                        {formatINRWhole(simulation.projection.dailyReductionPaise)}/day less)
                      </AppText>
                    </View>
                  </View>
                ) : null}

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* Metric 2: Remaining Cycle Spendable Balance */}
                <View style={styles.metricRow}>
                  <View style={styles.metricInfo}>
                    <AppText variant="bodyStrong">Cycle spendable pool</AppText>
                    <AppText variant="caption" color="muted">
                      Balance until payday
                    </AppText>
                  </View>
                  <View style={styles.metricValues}>
                    <View style={styles.metricBox}>
                      <AppText variant="caption" color="muted">
                        Before
                      </AppText>
                      <AppText variant="bodyStrong" tabular>
                        {formatINRWhole(simulation.projection.currentCycleBalancePaise)}
                      </AppText>
                    </View>
                    <Icon name="arrow-forward" size={16} color="muted" />
                    <View style={styles.metricBox}>
                      <AppText variant="caption" color={getTierColorName(simulation.tier)}>
                        After
                      </AppText>
                      <AppText
                        variant="bodyStrong"
                        tabular
                        color={getTierColorName(simulation.tier)}
                      >
                        {formatINRWhole(simulation.projection.projectedCycleBalancePaise)}
                      </AppText>
                    </View>
                  </View>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* Metric 3: Protected Commitments (Bills & Savings) */}
                <View style={styles.commitmentsSection}>
                  <View style={styles.commitmentHeaderRow}>
                    <AppText variant="bodyStrong">Commitments & Protected Funds</AppText>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: simulation.projection.billsProtected
                            ? `${colors.accent}20`
                            : `${colors.coral}20`,
                          borderColor: simulation.projection.billsProtected
                            ? colors.accent
                            : colors.coral,
                        },
                      ]}
                    >
                      <Icon
                        name={
                          simulation.projection.billsProtected
                            ? 'shield-checkmark-outline'
                            : 'warning-outline'
                        }
                        size={12}
                        color={simulation.projection.billsProtected ? 'accent' : 'coral'}
                      />
                      <AppText
                        variant="caption"
                        color={simulation.projection.billsProtected ? 'accentText' : 'coralText'}
                        style={styles.statusBadgeText}
                      >
                        {simulation.projection.billsProtected ? 'Bills Protected' : 'Bills At Risk'}
                      </AppText>
                    </View>
                  </View>

                  <AppText variant="caption" color="muted" style={styles.commitmentExplainer}>
                    {simulation.recommendation.impactOnBillsMessage}
                  </AppText>
                </View>
              </View>

              {/* Recommendation Card */}
              <View
                style={[
                  styles.adviceCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor:
                      simulation.tier === 'SAFE'
                        ? `${colors.accent}40`
                        : simulation.tier === 'CAUTION'
                          ? `${colors.amber}40`
                          : `${colors.coral}40`,
                  },
                ]}
              >
                <View style={styles.adviceTop}>
                  <Icon name="bulb-outline" size={18} color={getTierColorName(simulation.tier)} />
                  <AppText variant="bodyStrong" color={getTierColorName(simulation.tier)}>
                    Financial Recommendation
                  </AppText>
                </View>
                <AppText variant="body" style={styles.adviceReasoning}>
                  {simulation.recommendation.reasoning}
                </AppText>
                <AppText variant="caption" color="muted" style={styles.advicePractical}>
                  💡 {simulation.recommendation.practicalAdvice}
                </AppText>
              </View>

              {/* Action Buttons: Confirm Purchase */}
              <View style={styles.actionButtonsWrap}>
                <Button
                  label={
                    simulation.tier === 'NOT_AFFORDABLE'
                      ? 'Confirm Purchase (Warning: Exceeds Budget)'
                      : `Confirm & Record ${formatINRWhole(amountPaise)}`
                  }
                  icon="checkmark"
                  onPress={handleConfirmPurchase}
                  loading={isConfirming}
                  variant={simulation.tier === 'NOT_AFFORDABLE' ? 'danger' : 'primary'}
                />

                <Button
                  label="Reset Simulation"
                  variant="secondary"
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setAmountPaise(null);
                    setDescription('');
                    setConfirmedId(null);
                  }}
                />
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        /* ==================== MULTI-AMOUNT COMPARISON MODE ==================== */
        <View style={styles.modeContent}>
          <View
            style={[
              styles.inputCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <AppText variant="bodyStrong">Compare 3 Purchase Options</AppText>
            <AppText variant="caption" color="muted">
              Test alternative price tiers to see which fits your lifestyle and commitments best.
            </AppText>

            <View style={styles.compInputs}>
              <MoneyField
                label="Option A (e.g. Budget pick)"
                valuePaise={compOptionA}
                onChangePaise={setCompOptionA}
              />
              <MoneyField
                label="Option B (e.g. Balanced pick)"
                valuePaise={compOptionB}
                onChangePaise={setCompOptionB}
              />
              <MoneyField
                label="Option C (e.g. Premium pick)"
                valuePaise={compOptionC}
                onChangePaise={setCompOptionC}
              />
            </View>
          </View>

          {/* Comparison Cards */}
          <View style={styles.comparisonList}>
            {comparisonResults.map((item) => {
              const tierBadgeStyle = getTierStyles(item.tier, colors);
              return (
                <View
                  key={item.id}
                  style={[
                    styles.compCard,
                    { backgroundColor: colors.surface, borderColor: tierBadgeStyle.border },
                  ]}
                >
                  <View style={styles.compCardHeader}>
                    <View>
                      <AppText variant="caption" color="muted">
                        {item.label}
                      </AppText>
                      <AppText variant="title" tabular>
                        {formatINRWhole(item.amountPaise)}
                      </AppText>
                    </View>
                    <View
                      style={[
                        styles.tierPill,
                        { backgroundColor: tierBadgeStyle.bg, borderColor: tierBadgeStyle.border },
                      ]}
                    >
                      <Icon name={tierBadgeStyle.icon} size={14} color={tierBadgeStyle.textColor} />
                      <AppText
                        variant="caption"
                        color={tierBadgeStyle.textColor}
                        style={styles.tierPillText}
                      >
                        {item.tier.replace('_', ' ')}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.compMetricsRow}>
                    <View style={styles.compMetric}>
                      <AppText variant="caption" color="muted">
                        Daily Allowance
                      </AppText>
                      <AppText variant="bodyStrong" tabular color={tierBadgeStyle.textColor}>
                        {formatINRWhole(item.projectedDailySafeToSpendPaise)}/day
                      </AppText>
                    </View>
                    <View style={styles.compMetric}>
                      <AppText variant="caption" color="muted">
                        Cycle Balance
                      </AppText>
                      <AppText variant="bodyStrong" tabular>
                        {formatINRWhole(item.projectedCycleBalancePaise)}
                      </AppText>
                    </View>
                  </View>

                  <PressableScale
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setAmountPaise(item.amountPaise);
                      setDescription(item.label);
                      setMode('single');
                    }}
                    style={[styles.compSelectBtn, { borderColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${item.label} for simulation`}
                  >
                    <AppText variant="label" color="accent">
                      Inspect & Confirm This Option →
                    </AppText>
                  </PressableScale>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </Screen>
  );
}

/* ---------------------------------- Subcomponents & Helpers ---------------------------------- */

function OutcomeBanner({
  tier,
  recommendation,
  colors,
}: {
  tier: AffordabilityTier;
  recommendation: { headline: string };
  colors: Palette;
}) {
  const stylesConfig = getTierStyles(tier, colors);

  return (
    <View
      style={[
        styles.bannerContainer,
        { backgroundColor: stylesConfig.bg, borderColor: stylesConfig.border },
      ]}
    >
      <View style={styles.bannerHeader}>
        <View style={[styles.bannerIconWrap, { backgroundColor: stylesConfig.iconBg }]}>
          <Icon name={stylesConfig.icon} size={22} color={stylesConfig.textColor} />
        </View>
        <View style={styles.bannerTitleCol}>
          <AppText variant="caption" color={stylesConfig.textColor} style={styles.tierLabel}>
            {tier === 'SAFE'
              ? '● SAFE TO PURCHASE'
              : tier === 'CAUTION'
                ? '▲ PROCEED WITH CAUTION'
                : '✕ NOT RECOMMENDED THIS CYCLE'}
          </AppText>
          <AppText variant="heading" style={styles.bannerHeadline}>
            {recommendation.headline}
          </AppText>
        </View>
      </View>
    </View>
  );
}

function getTierStyles(
  tier: AffordabilityTier,
  colors: Palette,
): {
  bg: string;
  border: string;
  iconBg: string;
  textColor: 'accentText' | 'amberText' | 'coralText';
  icon: IconName;
} {
  switch (tier) {
    case 'SAFE':
      return {
        bg: `${colors.accent}14`,
        border: `${colors.accent}45`,
        iconBg: `${colors.accent}25`,
        textColor: 'accentText',
        icon: 'shield-checkmark-outline',
      };
    case 'CAUTION':
      return {
        bg: `${colors.amber}14`,
        border: `${colors.amber}45`,
        iconBg: `${colors.amber}25`,
        textColor: 'amberText',
        icon: 'warning-outline',
      };
    case 'NOT_AFFORDABLE':
      return {
        bg: `${colors.coral}14`,
        border: `${colors.coral}45`,
        iconBg: `${colors.coral}25`,
        textColor: 'coralText',
        icon: 'alert-circle-outline',
      };
  }
}

function getTierColorName(tier: AffordabilityTier): 'accentText' | 'amberText' | 'coralText' {
  if (tier === 'SAFE') return 'accentText';
  if (tier === 'CAUTION') return 'amberText';
  return 'coralText';
}

/* ---------------------------------- Stylesheet ---------------------------------- */

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    marginBottom: SPACE.md,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },

  // Segmented control
  segmentedWrap: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: 3,
    marginBottom: SPACE.md,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },

  modeContent: {
    gap: SPACE.md,
    paddingBottom: SPACE.xxxl,
  },

  // Input Card
  inputCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.md,
    gap: SPACE.md,
  },
  presetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  presetLabel: {
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  presetsScroll: {
    gap: SPACE.xs,
    paddingRight: SPACE.sm,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  presetText: {
    fontWeight: '600',
  },
  categoryWrap: {
    gap: SPACE.xs,
    paddingTop: SPACE.xs,
  },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // Guidance empty card
  guidanceCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.md,
    gap: SPACE.sm,
  },
  guidanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  guidanceBody: {
    lineHeight: 19,
  },
  statPills: {
    flexDirection: 'row',
    gap: SPACE.xs,
    marginTop: SPACE.xs,
  },
  statPill: {
    flex: 1,
    borderRadius: RADIUS.md,
    padding: SPACE.sm,
    gap: 2,
  },

  // Results
  resultsWrap: {
    gap: SPACE.md,
  },

  // Banner
  bannerContainer: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.md,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  bannerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitleCol: {
    flex: 1,
    gap: 2,
  },
  tierLabel: {
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  bannerHeadline: {
    fontWeight: '600',
  },

  // Comparison Grid
  comparisonGrid: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.md,
    gap: SPACE.md,
  },
  gridTitle: {
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricInfo: {
    flex: 1,
    gap: 2,
  },
  metricValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  metricBox: {
    alignItems: 'center',
    minWidth: 64,
  },
  deltaPillRow: {
    flexDirection: 'row',
  },
  deltaPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  deltaText: {
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },

  // Commitments
  commitmentsSection: {
    gap: SPACE.xs,
  },
  commitmentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontWeight: '700',
  },
  commitmentExplainer: {
    lineHeight: 18,
    marginTop: 2,
  },

  // Advice Card
  adviceCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.md,
    gap: SPACE.xs,
  },
  adviceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adviceReasoning: {
    lineHeight: 20,
  },
  advicePractical: {
    lineHeight: 18,
    marginTop: 2,
  },

  // Actions
  actionButtonsWrap: {
    gap: SPACE.sm,
    marginTop: SPACE.xs,
  },

  // Compare mode
  compInputs: {
    gap: SPACE.sm,
  },
  comparisonList: {
    gap: SPACE.md,
  },
  compCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.md,
    gap: SPACE.sm,
  },
  compCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  tierPillText: {
    fontWeight: '700',
  },
  compMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACE.xs,
  },
  compMetric: {
    gap: 2,
  },
  compSelectBtn: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: SPACE.sm,
    alignItems: 'center',
  },
});
