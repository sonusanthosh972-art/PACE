import type { CategoryId } from './categories';
import { compact } from './merchant';
import type { Direction, Mode } from './transaction';

export interface UserRule {
  id: string;
  pattern: string; // a normalised merchant (see normaliseMerchant)
  category: CategoryId;
  createdAt: number;
}

/**
 * Built-in merchant map. Order matters: more specific keywords come first
 * ("instamart" before "swiggy"). Keywords of 3 characters or fewer must match a whole word
 * ("ola" must not match "coca cola"); longer ones match anywhere in the compacted name.
 */
export const MERCHANT_MAP: readonly (readonly [string, CategoryId])[] = [
  // Groceries & quick commerce
  ['instamart', 'groceries'],
  ['zepto', 'groceries'],
  ['blinkit', 'groceries'],
  ['grofers', 'groceries'],
  ['bigbasket', 'groceries'],
  ['dmart', 'groceries'],
  ['jiomart', 'groceries'],
  ['dunzo', 'groceries'],
  ['amazonfresh', 'groceries'],
  ['flipkartminutes', 'groceries'],
  // Coffee & snacks
  ['starbucks', 'coffee'],
  ['thirdwave', 'coffee'],
  ['bluetokai', 'coffee'],
  ['chaayos', 'coffee'],
  ['chaipoint', 'coffee'],
  ['cafecoffeeday', 'coffee'],
  ['ccd', 'coffee'],
  ['barista', 'coffee'],
  // Food & dining
  ['swiggy', 'food'],
  ['zomato', 'food'],
  ['eatsure', 'food'],
  ['dominos', 'food'],
  ['mcdonald', 'food'],
  ['kfc', 'food'],
  ['pizzahut', 'food'],
  ['burgerking', 'food'],
  ['haldiram', 'food'],
  ['faasos', 'food'],
  ['behrouz', 'food'],
  // Transport
  ['uber', 'transport'],
  ['ola', 'transport'],
  ['olacabs', 'transport'],
  ['rapido', 'transport'],
  ['irctc', 'transport'],
  ['redbus', 'transport'],
  ['metro', 'transport'],
  ['fastag', 'transport'],
  ['indigo', 'transport'],
  ['makemytrip', 'transport'],
  ['indianoil', 'transport'],
  ['hpcl', 'transport'],
  ['bpcl', 'transport'],
  // Subscriptions
  ['netflix', 'subscriptions'],
  ['spotify', 'subscriptions'],
  ['hotstar', 'subscriptions'],
  ['primevideo', 'subscriptions'],
  ['youtube', 'subscriptions'],
  ['applemedia', 'subscriptions'],
  ['googleplay', 'subscriptions'],
  ['sonyliv', 'subscriptions'],
  // Shopping
  ['amazon', 'shopping'],
  ['flipkart', 'shopping'],
  ['myntra', 'shopping'],
  ['ajio', 'shopping'],
  ['meesho', 'shopping'],
  ['nykaa', 'shopping'],
  ['tatacliq', 'shopping'],
  ['croma', 'shopping'],
  ['decathlon', 'shopping'],
  ['ikea', 'shopping'],
  // Entertainment
  ['bookmyshow', 'entertainment'],
  ['pvr', 'entertainment'],
  ['inox', 'entertainment'],
  ['district', 'entertainment'],
  // Bills & recharge
  ['jio', 'bills'],
  ['airtel', 'bills'],
  ['bsnl', 'bills'],
  ['vi', 'bills'],
  ['vodafone', 'bills'],
  ['tatapower', 'bills'],
  ['bescom', 'bills'],
  ['adani', 'bills'],
  ['electricity', 'bills'],
  ['broadband', 'bills'],
  ['actfibernet', 'bills'],
  ['mahanagargas', 'bills'],
  // Health
  ['apollo', 'health'],
  ['pharmeasy', 'health'],
  ['1mg', 'health'],
  ['netmeds', 'health'],
  ['medplus', 'health'],
  ['practo', 'health'],
  ['cult', 'health'],
  ['hospital', 'health'],
  ['clinic', 'health'],
  // Rent & EMI
  ['nobroker', 'rent_emi'],
  ['rent', 'rent_emi'],
  ['emi', 'rent_emi'],
  ['bajajfinance', 'rent_emi'],
];

function keywordMatches(norm: string, keyword: string): boolean {
  if (keyword.length <= 3) return norm.split(' ').includes(keyword);
  return compact(norm).includes(keyword);
}

export interface CategoriseInput {
  merchantNorm: string;
  vpa: string | null;
  mode: Mode;
  direction: Direction;
}

export interface CategoriseResult {
  category: CategoryId;
  needsReview: boolean;
  matchedBy: 'rule' | 'map' | 'heuristic' | 'fallback';
}

/** Finds the newest rule that matches; `rules` may be in any order. */
export function findRule(merchantNorm: string, rules: readonly UserRule[]): UserRule | null {
  if (!merchantNorm) return null;
  let best: UserRule | null = null;
  for (const rule of rules) {
    const hit =
      rule.pattern === merchantNorm ||
      (rule.pattern.length >= 3 && compact(merchantNorm).includes(compact(rule.pattern)));
    if (hit && (best === null || rule.createdAt > best.createdAt)) best = rule;
  }
  return best;
}

/** Order: 1. user rules → 2. built-in merchant map → 3. heuristics → 4. "Uncategorised". */
export function categorise(input: CategoriseInput, rules: readonly UserRule[]): CategoriseResult {
  const rule = findRule(input.merchantNorm, rules);
  if (rule) return { category: rule.category, needsReview: false, matchedBy: 'rule' };

  if (input.merchantNorm) {
    for (const [keyword, category] of MERCHANT_MAP) {
      if (keywordMatches(input.merchantNorm, keyword)) {
        return { category, needsReview: false, matchedBy: 'map' };
      }
    }
  }

  if (input.mode === 'ATM') return { category: 'cash', needsReview: false, matchedBy: 'heuristic' };
  if (input.direction === 'credit') {
    return { category: 'other', needsReview: false, matchedBy: 'heuristic' };
  }

  const vpaLocal = input.vpa?.split('@')[0] ?? '';
  if (/^\d{10}$/.test(vpaLocal) || /^[6-9]\d{9}$/.test(input.merchantNorm.replace(/\s/g, ''))) {
    return { category: 'transfers', needsReview: false, matchedBy: 'heuristic' };
  }
  // Bank transfers (IMPS/NEFT) to a named payee are almost always people, not shops.
  if (input.mode === 'IMPS' || input.mode === 'NEFT') {
    return { category: 'transfers', needsReview: false, matchedBy: 'heuristic' };
  }

  return { category: 'uncategorised', needsReview: true, matchedBy: 'fallback' };
}
