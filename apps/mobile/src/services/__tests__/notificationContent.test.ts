import {
  morningBody,
  liveAlertBody,
  warn80Body,
  warn100Body,
  nightBody,
  weeklyBody,
  type MorningInput,
  type LiveAlertInput,
  type NightInput,
  type WeeklyInput,
} from '../notificationContent';

import type { InsightTx } from '@/domain/insights';

const tx = (overrides: Partial<InsightTx>): InsightTx => ({
  amountPaise: 300_00,
  direction: 'debit',
  category: 'food',
  isExcluded: false,
  merchantNorm: 'swiggy',
  merchantDisplay: 'Swiggy',
  occurredAt: Date.now(),
  ...overrides,
});

describe('notificationContent', () => {
  describe('morningBody', () => {
    it('shows budget with no yesterday data', () => {
      const input: MorningInput = {
        todayBudgetPaise: 1_579_00,
        yesterdayBudgetPaise: null,
        yesterdaySpentPaise: null,
      };
      expect(morningBody(input)).toBe("Today's budget: ₹1,579.");
    });

    it('includes overspend when yesterday was over budget', () => {
      const input: MorningInput = {
        todayBudgetPaise: 1_579_00,
        yesterdayBudgetPaise: 2_100_00,
        yesterdaySpentPaise: 2_621_00,
      };
      const body = morningBody(input);
      expect(body).toContain('₹1,579');
      expect(body).toContain('₹2,621 spent');
      expect(body).toContain('₹521 over');
    });

    it('celebrates when yesterday was under budget', () => {
      const input: MorningInput = {
        todayBudgetPaise: 1_579_00,
        yesterdayBudgetPaise: 1_500_00,
        yesterdaySpentPaise: 1_080_00,
      };
      const body = morningBody(input);
      expect(body).toContain('saved ₹420');
      expect(body).toContain('🎉');
    });

    it('handles exactly on budget', () => {
      const input: MorningInput = {
        todayBudgetPaise: 1_000_00,
        yesterdayBudgetPaise: 1_000_00,
        yesterdaySpentPaise: 1_000_00,
      };
      expect(morningBody(input)).toContain('exactly on budget');
    });
  });

  describe('liveAlertBody', () => {
    it('formats a payment with merchant and remaining', () => {
      const input: LiveAlertInput = {
        amountPaise: 300_00,
        merchant: 'Third Wave Coffee',
        vpa: 'thirdwave@ybl',
        category: 'coffee',
        remainingTodayPaise: 1_279_00,
      };
      const body = liveAlertBody(input);
      expect(body).toContain('☕');
      expect(body).toContain('₹300');
      expect(body).toContain('Third Wave Coffee');
      expect(body).toContain('₹1,279 left today');
    });

    it('shows ₹0 remaining when overspent', () => {
      const input: LiveAlertInput = {
        amountPaise: 500_00,
        merchant: 'Swiggy',
        vpa: null,
        category: 'food',
        remainingTodayPaise: -200_00,
      };
      const body = liveAlertBody(input);
      expect(body).toContain('₹0 left today');
    });
  });

  describe('warn80Body', () => {
    it('mentions 80% and remaining amount', () => {
      const body = warn80Body(1_200_00, 1_500_00);
      expect(body).toContain('80%');
      expect(body).toContain('₹300 left');
    });
  });

  describe('warn100Body', () => {
    it('mentions over amount when overspent', () => {
      const body = warn100Body(1_700_00, 1_500_00);
      expect(body).toContain('₹200 over');
    });

    it('warns about tomorrow when exactly at budget', () => {
      const body = warn100Body(1_500_00, 1_500_00);
      expect(body).toContain('fully used');
    });
  });

  describe('nightBody', () => {
    it('celebrates savings', () => {
      const input: NightInput = {
        budgetPaise: 1_579_00,
        spentPaise: 1_159_00,
        biggestLeak: null,
      };
      const body = nightBody(input);
      expect(body).toContain('saved ₹420');
      expect(body).toContain('🎉');
    });

    it('shows biggest leak when overspent', () => {
      const input: NightInput = {
        budgetPaise: 1_579_00,
        spentPaise: 2_100_00,
        biggestLeak: { merchant: 'Zepto', totalPaise: 800_00, count: 3 },
      };
      const body = nightBody(input);
      expect(body).toContain('Budget ₹1,579');
      expect(body).toContain('Spent ₹2,100');
      expect(body).toContain('Zepto ₹800 (3 orders)');
    });

    it('uses singular "order" for count 1', () => {
      const input: NightInput = {
        budgetPaise: 1_000_00,
        spentPaise: 1_200_00,
        biggestLeak: { merchant: 'Amazon', totalPaise: 500_00, count: 1 },
      };
      const body = nightBody(input);
      expect(body).toContain('1 order');
      expect(body).not.toContain('1 orders');
    });
  });

  describe('weeklyBody', () => {
    it('shows small leaks and top merchants', () => {
      const txs = [
        tx({ amountPaise: 90_00, merchantNorm: 'chaayos', merchantDisplay: 'Chaayos' }),
        tx({ amountPaise: 120_00, merchantNorm: 'chaayos', merchantDisplay: 'Chaayos' }),
        tx({ amountPaise: 350_00, merchantNorm: 'swiggy', merchantDisplay: 'Swiggy' }),
        tx({ amountPaise: 600_00, merchantNorm: 'amazon', merchantDisplay: 'Amazon' }),
      ];
      const input: WeeklyInput = { weekTxs: txs };
      const body = weeklyBody(input);
      expect(body).toContain('3 payments under ₹500');
      expect(body).toContain('Top merchants');
    });

    it('handles weeks with no small leaks', () => {
      const txs = [tx({ amountPaise: 600_00, merchantNorm: 'amazon', merchantDisplay: 'Amazon' })];
      const body = weeklyBody({ weekTxs: txs });
      expect(body).toContain('No small payments');
      expect(body).toContain('🎯');
    });

    it('handles weeks with no transactions', () => {
      const body = weeklyBody({ weekTxs: [] });
      expect(body).toContain('No small payments');
    });
  });
});
