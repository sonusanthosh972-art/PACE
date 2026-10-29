import {
  dailySpend,
  essentialSplit,
  smallLeaks,
  topMerchants,
  totalsByCategory,
  type InsightTx,
} from '../insights';

const T = Date.UTC(2026, 9, 24, 6, 0);

const tx = (p: Partial<InsightTx>): InsightTx => ({
  amountPaise: 10000,
  direction: 'debit',
  category: 'food',
  isExcluded: false,
  merchantNorm: 'zepto',
  merchantDisplay: 'Zepto',
  occurredAt: T,
  ...p,
});

const TXS: InsightTx[] = [
  tx({ amountPaise: 30000, category: 'groceries' }),
  tx({ amountPaise: 25000, category: 'groceries' }),
  tx({ amountPaise: 25000, category: 'groceries' }),
  tx({
    amountPaise: 120000,
    category: 'shopping',
    merchantNorm: 'amazon',
    merchantDisplay: 'Amazon',
  }),
  tx({
    amountPaise: 30000,
    category: 'coffee',
    merchantNorm: 'third wave',
    merchantDisplay: 'Third Wave',
  }),
  tx({ amountPaise: 5000000, category: 'rent_emi', merchantNorm: 'landlord' }),
  tx({ amountPaise: 900000, direction: 'credit', category: 'other' }),
  tx({ amountPaise: 40000, isExcluded: true, merchantNorm: 'self' }),
  tx({ amountPaise: 20000, category: 'food', occurredAt: T + 86_400_000 }),
];

describe('insights', () => {
  it('totals by category, excluding non-spend', () => {
    expect(totalsByCategory(TXS)).toEqual([
      { category: 'shopping', totalPaise: 120000, count: 1 },
      { category: 'groceries', totalPaise: 80000, count: 3 },
      { category: 'coffee', totalPaise: 30000, count: 1 },
      { category: 'food', totalPaise: 20000, count: 1 },
    ]);
  });

  it('small leaks: spend payments under ₹500', () => {
    expect(smallLeaks(TXS)).toEqual({ count: 5, totalPaise: 130000 });
  });

  it('top merchants by total', () => {
    expect(topMerchants(TXS).map((m) => [m.merchantDisplay, m.totalPaise, m.count])).toEqual([
      ['Amazon', 120000, 1],
      ['Zepto', 100000, 4],
      ['Third Wave', 30000, 1],
    ]);
  });

  it('essential vs non-essential', () => {
    expect(essentialSplit(TXS)).toEqual({ essentialPaise: 80000, nonEssentialPaise: 170000 });
  });

  it('daily spend keyed by IST date', () => {
    const daily = dailySpend(TXS);
    expect(daily.get('2026-10-24')).toBe(230000);
    expect(daily.get('2026-10-25')).toBe(20000);
  });
});

describe('dailySpend with refunds', () => {
  it('nets a refund against the same day no matter which came first', () => {
    const refund = tx({ amountPaise: 300_00, direction: 'credit', category: 'shopping' });
    const buy = tx({ amountPaise: 1000_00, category: 'shopping' });
    expect(dailySpend([refund, buy]).get('2026-10-24')).toBe(700_00);
    expect(dailySpend([buy, refund]).get('2026-10-24')).toBe(700_00);
  });
});
