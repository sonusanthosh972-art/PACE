export interface ParsedSimResult {
  rawText: string;
  isRejected: boolean;
  rejectionReason?: string;
  amountPaise: number | null;
  amountRupees: number | null;
  direction: 'debit' | 'credit' | null;
  merchant: string | null;
  merchantNorm: string | null;
  category: string;
  mode: string;
  accountLast4: string | null;
  upiRef: string | null;
  balancePaise: number | null;
  isCcBill: boolean;
  isSelfTransfer: boolean;
  isExcluded: boolean;
  exclusionNote: string | null;
  isRefund: boolean;
  isSalaryCandidate: boolean;
  detectedPayday?: number;
  dedupeHash: string;
}

const OTP_RE = /\b(otp|one[\s-]?time\s+pass(word|code)|verification\s+code|passcode)\b/i;
const FUTURE_RE =
  /\bwill\s+be\s+(auto[\s-]?)?(debited|deducted|charged|credited)\b|\b(is|are|payment|amount|bill)\s+due\b|\bdue\s+(on|by|date)\b|\breminder\b|\bscheduled\s+(for|on)\b|\bupcoming\b/i;
const FAILED_RE =
  /\b(failed|failure|declined|unsuccessful|rejected|could\s+not\s+be\s+(processed|completed)|insufficient\s+(funds|balance))\b/i;
const PROMO_RE =
  /\b(pre[\s-]?approved|apply\s+now|offers?|cashback\s+up\s*to|get\s+up\s*to|upto|congratulations|won|win|eligible\s+for|instant\s+loan)\b/i;

const CC_BILL_RE =
  /\b(cred|cc\s*payment|credit\s*card\s*(?:bill|pymt|payment)|card\s*payment|bbps\s*cc|autopay\s*cc|billdesk\*?cc|payment\s*towards\s*(?:your\s*)?(?:credit\s*)?card)\b/i;

const SELF_TRANSFER_RE =
  /\b(self[\s-]?transfer|transferred\s*to\s*(?:own|self)\s*a\/c|funds?\s*transfer\s*to\s*(?:own\s*)?a\/c|transfer\s*to\s*linked\s*a\/c)\b/i;

const SALARY_RE = /\b(salary|sal\s*cr|payroll|stipend|monthly\s*sal|wages)\b/i;
const REFUND_RE = /\b(refund(?:ed)?|cashback|reversal|reversed)\b/i;

export function simulateParse(rawInput: string): ParsedSimResult {
  const text = rawInput.trim();

  if (!text) {
    return {
      rawText: text,
      isRejected: true,
      rejectionReason: 'Empty message text',
      amountPaise: null,
      amountRupees: null,
      direction: null,
      merchant: null,
      merchantNorm: null,
      category: 'uncategorised',
      mode: 'OTHER',
      accountLast4: null,
      upiRef: null,
      balancePaise: null,
      isCcBill: false,
      isSelfTransfer: false,
      isExcluded: false,
      exclusionNote: null,
      isRefund: false,
      isSalaryCandidate: false,
      dedupeHash: '',
    };
  }

  // Check rejections
  if (OTP_RE.test(text)) {
    return makeRejection(text, 'OTP / Authentication security passcode (non-financial)');
  }
  if (FUTURE_RE.test(text)) {
    return makeRejection(text, 'Future payment reminder or bill due alert (no actual movement yet)');
  }
  if (FAILED_RE.test(text)) {
    return makeRejection(text, 'Failed or declined transaction');
  }
  if (PROMO_RE.test(text)) {
    return makeRejection(text, 'Promotional or loan offer notification');
  }

  // Extract amount
  const amtMatch = text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  let amountPaise: number | null = null;
  let amountRupees: number | null = null;
  if (amtMatch && amtMatch[1]) {
    const cleaned = amtMatch[1].replace(/,/g, '');
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      amountRupees = num;
      amountPaise = Math.round(num * 100);
    }
  }

  // Extract direction
  const isDebit = /\b(debited|spent|sent|paid|withdrawn|deducted|charged)\b/i.test(text);
  const isCredit = /\b(credited|received|deposited|refund(?:ed)?|added)\b/i.test(text);
  const direction: 'debit' | 'credit' = isDebit ? 'debit' : isCredit ? 'credit' : 'debit';

  // Exclusions
  const isCcBill = CC_BILL_RE.test(text);
  const isSelfTransfer = SELF_TRANSFER_RE.test(text);
  const isExcluded = isCcBill || isSelfTransfer;
  const exclusionNote = isCcBill
    ? "Credit card bill payment — excluded so expenses aren't counted twice"
    : isSelfTransfer
      ? 'Transfer between your own accounts'
      : null;

  // Refunds & Salary
  const isRefund = REFUND_RE.test(text);
  const isSalaryCandidate = direction === 'credit' && (SALARY_RE.test(text) || (amountPaise ?? 0) >= 15_000_00);
  const detectedPayday = isSalaryCandidate ? new Date().getDate() : undefined;

  // Account Last 4
  const accMatch = text.match(/\b(?:a\/c|ac|acct|card|onecard)\b.*?(?:x+|\*+)?(\d{3,4})\b/i);
  const accountLast4 = accMatch ? accMatch[1] ?? null : null;

  // UPI Reference
  const upiMatch = text.match(/\b(?:upi|ref|rrn|utr)[\s.:#-]*(\d{9,18})\b/i);
  const upiRef = upiMatch ? upiMatch[1] ?? null : null;

  // Mode
  let mode = 'OTHER';
  if (/\b(auto[\s-]?pay|e-?mandate|nach|standing\s+instruction)\b/i.test(text)) mode = 'AUTOPAY';
  else if (/\b(atm|cash\s+withdrawal)\b/i.test(text)) mode = 'ATM';
  else if (/\bupi\b/i.test(text) || upiRef) mode = 'UPI';
  else if (/\b(card|onecard|pos|spent\s+on)\b/i.test(text)) mode = 'CARD';
  else if (/\bneft\b/i.test(text)) mode = 'NEFT';
  else if (/\bimps\b/i.test(text)) mode = 'IMPS';

  // Merchant
  let merchant = 'Unknown Merchant';
  if (/netflix/i.test(text)) merchant = 'Netflix';
  else if (/spotify/i.test(text)) merchant = 'Spotify India';
  else if (/zomato/i.test(text)) merchant = 'Zomato';
  else if (/swiggy/i.test(text)) merchant = 'Swiggy';
  else if (/blinkit/i.test(text)) merchant = 'Blinkit';
  else if (/zepto/i.test(text)) merchant = 'Zepto';
  else if (/amazon/i.test(text)) merchant = 'Amazon';
  else if (/flipkart/i.test(text)) merchant = 'Flipkart';
  else if (/third\s*wave/i.test(text)) merchant = 'Third Wave Coffee';
  else if (/uber/i.test(text)) merchant = 'Uber';
  else if (/ola/i.test(text)) merchant = 'Ola';
  else if (/cred/i.test(text)) merchant = 'CRED CC';
  else {
    const toMatch = text.match(/\b(?:to|at|towards)\s+([A-Za-z0-9 .&'-]{2,30}?)(?=\s+(?:on|via|ref|bal|using|from|\.)|$)/i);
    if (toMatch && toMatch[1]) merchant = toMatch[1].trim();
  }

  const merchantNorm = merchant.toLowerCase().replace(/[^a-z0-9]/g, '_');

  // Category
  let category = 'other';
  if (/coffee|starbucks|third\s*wave|blue\s*tokai/i.test(merchant)) category = 'coffee';
  else if (/food|zomato|swiggy|restaurant|dining|mcdonald/i.test(merchant)) category = 'food';
  else if (/blinkit|zepto|instamart|grocery|supermarket/i.test(merchant)) category = 'groceries';
  else if (/uber|ola|rapido|metro|petrol|fuel|indian\s*oil/i.test(merchant)) category = 'transport';
  else if (/amazon|flipkart|myntra|zara|shopping/i.test(merchant)) category = 'shopping';
  else if (/netflix|spotify|youtube|disney|prime|hotstar/i.test(merchant) || mode === 'AUTOPAY') category = 'subscriptions';
  else if (/bescom|airtel|jio|electricity|utility|bill/i.test(merchant)) category = 'bills';
  else if (/apollo|pharmacy|hospital|practo|1mg/i.test(merchant)) category = 'health';
  else if (/atm|cash/i.test(mode)) category = 'cash';

  const dedupeHash = `d_${upiRef ?? merchantNorm}_${amountPaise ?? 0}`;

  return {
    rawText: text,
    isRejected: false,
    amountPaise,
    amountRupees,
    direction,
    merchant,
    merchantNorm,
    category,
    mode,
    accountLast4,
    upiRef,
    balancePaise: null,
    isCcBill,
    isSelfTransfer,
    isExcluded,
    exclusionNote,
    isRefund,
    isSalaryCandidate,
    detectedPayday,
    dedupeHash,
  };
}

function makeRejection(rawText: string, reason: string): ParsedSimResult {
  return {
    rawText,
    isRejected: true,
    rejectionReason: reason,
    amountPaise: null,
    amountRupees: null,
    direction: null,
    merchant: null,
    merchantNorm: null,
    category: 'rejected',
    mode: 'NONE',
    accountLast4: null,
    upiRef: null,
    balancePaise: null,
    isCcBill: false,
    isSelfTransfer: false,
    isExcluded: false,
    exclusionNote: null,
    isRefund: false,
    isSalaryCandidate: false,
    dedupeHash: '',
  };
}
