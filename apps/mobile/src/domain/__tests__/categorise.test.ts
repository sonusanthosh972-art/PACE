import { categorise, findRule, type UserRule } from '../categorise';
import { CATEGORIES, CATEGORY_LIST } from '../categories';
import { displayMerchant, merchantsMatch, normaliseMerchant } from '../merchant';

const debitUpi = { vpa: null, mode: 'UPI' as const, direction: 'debit' as const };

describe('normaliseMerchant', () => {
  it.each([
    ['Swiggy Pvt. Ltd.', null, 'swiggy'],
    [null, 'swiggy.stores@axb', 'swiggy stores'],
    ['THIRD WAVE COFFEE', null, 'third wave coffee'],
    ['zepto@ybl', 'zepto@ybl', 'zepto'],
    [null, null, ''],
  ])('%s / %s → %s', (m, v, expected) => {
    expect(normaliseMerchant(m, v)).toBe(expected);
  });
});

describe('merchantsMatch / displayMerchant', () => {
  it('matches compact variants', () => {
    expect(merchantsMatch('third wave coffee', 'thirdwave')).toBe(true);
    expect(merchantsMatch('zomato', 'swiggy')).toBe(false);
    expect(merchantsMatch('ab', 'ab')).toBe(false);
  });

  it('title-cases VPAs for display', () => {
    expect(displayMerchant('zepto@ybl', 'zepto@ybl')).toBe('Zepto');
    expect(displayMerchant('Third Wave', null)).toBe('Third Wave');
  });
});

describe('categorise', () => {
  it('1. user rules win over the built-in map (newest rule first)', () => {
    const rules: UserRule[] = [
      { id: '1', pattern: 'swiggy', category: 'groceries', createdAt: 1 },
      { id: '2', pattern: 'swiggy', category: 'entertainment', createdAt: 2 },
    ];
    expect(categorise({ ...debitUpi, merchantNorm: 'swiggy' }, rules)).toEqual({
      category: 'entertainment',
      needsReview: false,
      matchedBy: 'rule',
    });
  });

  it('rules also match as a substring', () => {
    const rules: UserRule[] = [{ id: '1', pattern: 'ravi', category: 'rent_emi', createdAt: 1 }];
    expect(findRule('ravi kumar', rules)?.id).toBe('1');
    expect(findRule('', rules)).toBeNull();
  });

  it.each([
    ['zepto', 'groceries'],
    ['blinkit', 'groceries'],
    ['swiggy instamart', 'groceries'],
    ['swiggy', 'food'],
    ['zomato', 'food'],
    ['uber india', 'transport'],
    ['ola', 'transport'],
    ['rapido', 'transport'],
    ['amazon pay', 'shopping'],
    ['flipkart', 'shopping'],
    ['myntra designs', 'shopping'],
    ['starbucks', 'coffee'],
    ['irctc', 'transport'],
    ['netflix', 'subscriptions'],
    ['jio prepaid', 'bills'],
    ['airtel', 'bills'],
  ] as const)('2. built-in map: %s → %s', (merchantNorm, category) => {
    expect(categorise({ ...debitUpi, merchantNorm }, []).category).toBe(category);
  });

  it('short keywords only match whole words', () => {
    expect(categorise({ ...debitUpi, merchantNorm: 'coca cola' }, []).category).toBe(
      'uncategorised',
    );
    expect(categorise({ ...debitUpi, merchantNorm: 'vivek stores' }, []).category).toBe(
      'uncategorised',
    );
  });

  it('3. fallback is Uncategorised and flagged for review', () => {
    expect(categorise({ ...debitUpi, merchantNorm: 'sri lakshmi tiffins' }, [])).toEqual({
      category: 'uncategorised',
      needsReview: true,
      matchedBy: 'fallback',
    });
  });

  it('heuristics: ATM → cash, phone VPA → transfers, IMPS → transfers, credit → other', () => {
    expect(categorise({ ...debitUpi, mode: 'ATM', merchantNorm: '' }, []).category).toBe('cash');
    expect(
      categorise({ ...debitUpi, vpa: '9876543210@ybl', merchantNorm: '9876543210' }, []).category,
    ).toBe('transfers');
    expect(categorise({ ...debitUpi, mode: 'IMPS', merchantNorm: 'ravi kumar' }, []).category).toBe(
      'transfers',
    );
    expect(
      categorise({ ...debitUpi, direction: 'credit', merchantNorm: 'acme corp' }, []).category,
    ).toBe('other');
  });
});

describe('categories', () => {
  it('every category declares isEssential, and only Rent & EMI is fixed', () => {
    for (const c of CATEGORY_LIST) expect(typeof c.isEssential).toBe('boolean');
    expect(CATEGORY_LIST.filter((c) => c.isFixed).map((c) => c.id)).toEqual(['rent_emi']);
    expect(CATEGORIES.groceries.isEssential).toBe(true);
    expect(CATEGORIES.coffee.isEssential).toBe(false);
  });
});
