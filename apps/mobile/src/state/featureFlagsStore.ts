import { create } from 'zustand';

export type FeatureFlagKey =
  | 'enableOfflineSync'
  | 'enableNewTransactionUI'
  | 'enableAdvancedAnalytics'
  | 'enableBudgetOptimization'
  | 'enableMultiCurrency'
  | 'enableAIInsights'
  | 'enableBiometricBackup';

interface FeatureFlag {
  enabled: boolean;
  rolloutPercentage: number; // 0-100
  description: string;
}

interface FeatureFlagsStore {
  flags: Map<FeatureFlagKey, FeatureFlag>;
  isEnabled: (key: FeatureFlagKey) => boolean;
  setFlag: (key: FeatureFlagKey, enabled: boolean) => void;
  setRollout: (key: FeatureFlagKey, percentage: number) => void;
  toggleFlag: (key: FeatureFlagKey) => void;
  initializeFlags: (flags: Record<FeatureFlagKey, FeatureFlag>) => void;
}

const DEFAULT_FLAGS: Record<FeatureFlagKey, FeatureFlag> = {
  enableOfflineSync: {
    enabled: true,
    rolloutPercentage: 100,
    description: 'Sync transactions when device is offline',
  },
  enableNewTransactionUI: {
    enabled: false,
    rolloutPercentage: 50,
    description: 'New transaction interface',
  },
  enableAdvancedAnalytics: {
    enabled: true,
    rolloutPercentage: 100,
    description: 'Advanced spending analytics',
  },
  enableBudgetOptimization: {
    enabled: false,
    rolloutPercentage: 30,
    description: 'AI-powered budget optimization',
  },
  enableMultiCurrency: {
    enabled: false,
    rolloutPercentage: 0,
    description: 'Multi-currency support',
  },
  enableAIInsights: {
    enabled: false,
    rolloutPercentage: 20,
    description: 'AI-powered spending insights',
  },
  enableBiometricBackup: {
    enabled: true,
    rolloutPercentage: 100,
    description: 'Biometric authentication for backup',
  },
};

export const useFeatureFlagsStore = create<FeatureFlagsStore>((set, get) => ({
  flags: new Map(Object.entries(DEFAULT_FLAGS) as [FeatureFlagKey, FeatureFlag][]),

  isEnabled: (key: FeatureFlagKey) => {
    const flag = get().flags.get(key);
    if (!flag || !flag.enabled) return false;

    // Check rollout percentage - use device ID or similar for consistency
    const randomValue = Math.random() * 100;
    return randomValue < flag.rolloutPercentage;
  },

  setFlag: (key, enabled) => {
    set((state) => {
      const flags = new Map(state.flags);
      const flag = flags.get(key);
      if (flag) {
        flags.set(key, { ...flag, enabled });
      }
      return { flags };
    });
  },

  setRollout: (key, percentage) => {
    set((state) => {
      const flags = new Map(state.flags);
      const flag = flags.get(key);
      if (flag) {
        flags.set(key, { ...flag, rolloutPercentage: Math.max(0, Math.min(100, percentage)) });
      }
      return { flags };
    });
  },

  toggleFlag: (key) => {
    const current = get().isEnabled(key);
    get().setFlag(key, !current);
  },

  initializeFlags: (flags) => {
    set({
      flags: new Map(Object.entries(flags) as [FeatureFlagKey, FeatureFlag][]),
    });
  },
}));

// Hook for checking feature flags
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const isEnabled = useFeatureFlagsStore((s) => s.isEnabled);
  return isEnabled(key);
}
