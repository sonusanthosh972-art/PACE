import { categorise } from '../categorise';
import type { CategoryId } from '../categories';
import { normaliseMerchant } from '../merchant';
import { parseNotification, parseSms } from '../parsing/parseSms';
import { isBankSender } from '../parsing/senders';
import type { ParsedTransaction } from '../transaction';

const RECEIVED_AT = Date.UTC(2026, 9, 24, 4, 45); // 24 Oct 2026, 10:15 IST

interface Case {
  name: string;
  sender: string;
  body: string;
  /** null → must be ignored. */
  expected: (Partial<ParsedTransaction> & { category?: CategoryId }) | null;
}

const CASES: Case[] = [
  // ---------------------------------------------------------------- HDFC
  {
    name: 'HDFC UPI debit (Sent Rs.)',
    sender: 'VM-HDFCBK',
    body: 'Sent Rs.300.00\nFrom HDFC Bank A/C *1234\nTo THIRD WAVE COFFEE\nOn 24/10/26\nRef 429812345678\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808',
    expected: {
      amountPaise: 30000,
      direction: 'debit',
      accountLast4: '1234',
      merchant: 'THIRD WAVE COFFEE',
      mode: 'UPI',
      upiRef: '429812345678',
      category: 'coffee',
    },
  },
  {
    name: 'HDFC card spend with comma and paise',
    sender: 'AD-HDFCBK',
    body: 'Spent Rs.1,250.50 On HDFC Bank Card 4321 At AMAZON PAY INDIA On 2026-10-24:10:15:32 Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 4321 to 7308080808',
    expected: {
      amountPaise: 125050,
      direction: 'debit',
      accountLast4: '4321',
      merchant: 'AMAZON PAY INDIA',
      mode: 'CARD',
      category: 'shopping',
    },
  },
  {
    name: 'HDFC UPI credit from VPA',
    sender: 'VM-HDFCBK',
    body: 'Credit Alert!\nRs.5,000.00 credited to HDFC Bank A/c XX1234 on 24-10-26 from VPA rahul.sharma@okicici (UPI 429812345679)',
    expected: {
      amountPaise: 500000,
      direction: 'credit',
      accountLast4: '1234',
      merchant: 'rahul.sharma@okicici',
      vpa: 'rahul.sharma@okicici',
      mode: 'UPI',
      upiRef: '429812345679',
    },
  },
  {
    name: 'HDFC ATM withdrawal with balance',
    sender: 'VM-HDFCBK',
    body: 'Rs.2000 withdrawn from HDFC Bank A/c XX1234 at ATM HDFC0001234 BANGALORE on 24-10-26. Avl bal: Rs.45,320.00',
    expected: {
      amountPaise: 200000,
      direction: 'debit',
      mode: 'ATM',
      balancePaise: 4532000,
      category: 'cash',
    },
  },
  {
    name: 'HDFC e-mandate autopay debit',
    sender: 'VM-HDFCBK',
    body: 'Rs.649.00 has been debited from A/c XX1234 towards NETFLIX for Autopay (E-Mandate). UMRN: HDFC0000000012345',
    expected: {
      amountPaise: 64900,
      direction: 'debit',
      merchant: 'NETFLIX',
      mode: 'AUTOPAY',
      category: 'subscriptions',
    },
  },
  {
    name: 'HDFC "will be debited" reminder',
    sender: 'VM-HDFCBK',
    body: 'Your A/c XX1234 will be debited with Rs.649.00 on 25-10-26 towards NETFLIX for E-Mandate. To cancel, visit hdfcbank.com',
    expected: null,
  },
  {
    name: 'HDFC OTP',
    sender: 'VM-HDFCBK',
    body: 'OTP is 482913 for txn of INR 1,250.50 at AMAZON on HDFC Bank card ending 4321. Valid till 10:20. Do not share OTP for security reasons.',
    expected: null,
  },
  {
    name: 'HDFC promo loan',
    sender: 'AD-HDFCBK',
    body: 'Get a pre-approved Personal Loan of up to Rs.5,00,000 credited instantly! Apply now: hdfcbk.io/x T&C',
    expected: null,
  },
  {
    name: 'HDFC new DLT suffix, UPI to quick commerce VPA',
    sender: 'AD-HDFCBK-S',
    body: 'Sent Rs.85\nFrom HDFC Bank A/C *1234\nTo blinkit@hdfcbank\nOn 24/10/26\nRef 429812345694\nNot You? Call 18002586161',
    expected: {
      amountPaise: 8500,
      direction: 'debit',
      merchant: 'blinkit@hdfcbank',
      upiRef: '429812345694',
      category: 'groceries',
    },
  },
  {
    name: 'HDFC refund credit to card',
    sender: 'VM-HDFCBK',
    body: 'Rs.1,299.00 refund credited to HDFC Bank Card 4321 from AMAZON on 24-10-26',
    expected: {
      amountPaise: 129900,
      direction: 'credit',
      merchant: 'AMAZON',
      accountLast4: '4321',
    },
  },
  {
    name: 'HDFC UPI autopay (mandate) recharge',
    sender: 'VM-HDFCBK',
    body: 'Rs.299.00 debited from HDFC Bank A/c XX1234 towards AIRTEL for Autopay (UPI Mandate). UPI Ref 429812345698',
    expected: { amountPaise: 29900, mode: 'AUTOPAY', merchant: 'AIRTEL', category: 'bills' },
  },
  // ---------------------------------------------------------------- ICICI
  {
    name: 'ICICI UPI debit ("; ZOMATO credited")',
    sender: 'JD-ICICIB',
    body: 'ICICI Bank Acct XX123 debited for Rs 450.00 on 24-Oct-26; ZOMATO credited. UPI:429812345680. Call 18002662 for dispute. SMS BLOCK 123 to 9215676766.',
    expected: {
      amountPaise: 45000,
      direction: 'debit',
      accountLast4: '123',
      merchant: 'ZOMATO',
      mode: 'UPI',
      upiRef: '429812345680',
      category: 'food',
    },
  },
  {
    name: 'ICICI credit card spend with limit (not balance)',
    sender: 'VK-ICICIB-S',
    body: 'INR 1,299.00 spent using ICICI Bank Card XX4321 on 24-Oct-26 on AMAZON. Avl Limit: INR 98,701.00. If not you, call 1800 2662/SMS BLOCK 4321 to 9215676766',
    expected: {
      amountPaise: 129900,
      direction: 'debit',
      accountLast4: '4321',
      merchant: 'AMAZON',
      mode: 'CARD',
      balancePaise: null,
    },
  },
  {
    name: 'ICICI UPI credit from company',
    sender: 'JD-ICICIB',
    body: 'Dear Customer, Acct XX123 is credited with Rs 25,000.00 on 24-Oct-26 from ACME TECHNOLOGIES PVT LTD. UPI:429812345681-ICICI Bank.',
    expected: {
      amountPaise: 2500000,
      direction: 'credit',
      merchant: 'ACME TECHNOLOGIES PVT LTD',
      upiRef: '429812345681',
    },
  },
  {
    name: 'ICICI NEFT salary credit (lakh grouping, Info:)',
    sender: 'JD-ICICIB',
    body: 'Dear Customer, your Acct XX123 has been credited with INR 1,00,000.00 on 01-Oct-26. Info: NEFT-ACME CORP SALARY. Available Balance is INR 1,24,500.00.',
    expected: {
      amountPaise: 10000000,
      direction: 'credit',
      mode: 'NEFT',
      merchant: 'ACME CORP SALARY',
      balancePaise: 12450000,
    },
  },
  {
    name: 'ICICI OTP',
    sender: 'JD-ICICIB',
    body: 'Dear Customer, 845123 is the OTP for your txn of INR 2,500.00 at FLIPKART on ICICI Bank Credit Card XX4321. OTPs are SECRET. DO NOT disclose it to anyone.',
    expected: null,
  },
  {
    name: 'ICICI failed card txn',
    sender: 'JD-ICICIB',
    body: 'Your transaction of Rs 799.00 on ICICI Bank Card XX4321 at MYNTRA has failed due to incorrect PIN.',
    expected: null,
  },
  {
    name: 'ICICI UPI to a phone-number VPA (person)',
    sender: 'JD-ICICIB',
    body: 'ICICI Bank Acct XX123 debited for Rs 200.00 on 24-Oct-26; 9876543210@ybl credited. UPI:429812345682.',
    expected: {
      amountPaise: 20000,
      direction: 'debit',
      vpa: '9876543210@ybl',
      merchant: '9876543210@ybl',
      category: 'transfers',
    },
  },
  {
    name: 'ICICI lowercase rs, card at Starbucks',
    sender: 'JD-ICICIB',
    body: 'rs 300 spent at starbucks using icici bank card xx4321',
    expected: {
      amountPaise: 30000,
      merchant: 'starbucks',
      accountLast4: '4321',
      category: 'coffee',
    },
  },
  // ---------------------------------------------------------------- SBI
  {
    name: 'SBI UPI debit without currency symbol ("debited by 300.0")',
    sender: 'AD-SBIUPI',
    body: 'Dear UPI user A/C X1234 debited by 300.0 on date 24Oct26 trf to ZOMATO Refno 429812345683. If not u? call 1800111109. -SBI',
    expected: {
      amountPaise: 30000,
      direction: 'debit',
      accountLast4: '1234',
      merchant: 'ZOMATO',
      mode: 'UPI',
      upiRef: '429812345683',
      category: 'food',
    },
  },
  {
    name: 'SBI UPI credit ("Rs500", A/cX1234)',
    sender: 'AD-SBIUPI',
    body: 'Dear SBI UPI User, ur A/cX1234 credited by Rs500 on 24Oct26 by (Ref no 429812345684)',
    expected: {
      amountPaise: 50000,
      direction: 'credit',
      accountLast4: '1234',
      upiRef: '429812345684',
      merchant: null,
    },
  },
  {
    name: 'SBI credit card spend (card ending)',
    sender: 'BZ-SBICRD',
    body: 'Rs.1,499.00 spent on your SBI Credit Card ending 5678 at FLIPKART on 24/10/26. Trxn. not done by you? Report at https://sbicard.com/Dispute',
    expected: {
      amountPaise: 149900,
      accountLast4: '5678',
      merchant: 'FLIPKART',
      mode: 'CARD',
      category: 'shopping',
    },
  },
  {
    name: 'SBI ATM withdrawal',
    sender: 'VM-ATMSBI',
    body: 'Dear Customer, Your A/c no. XX1234 is debited for Rs.5,000.00 on 24-10-26 by ATM withdrawal at SBI ATM S1BW000123. Avl Bal Rs.12,345.67. -SBI',
    expected: {
      amountPaise: 500000,
      direction: 'debit',
      mode: 'ATM',
      balancePaise: 1234567,
      category: 'cash',
    },
  },
  {
    name: 'SBI IMPS salary credit',
    sender: 'VM-CBSSBI',
    body: 'Your a/c no. XXXXXXXX1234 is credited by Rs.75,000.00 on 01-10-26 by a/c linked to mobile 9XXXXXX000-ACME PAYROLL (IMPS Ref no 627412345678).',
    expected: {
      amountPaise: 7500000,
      direction: 'credit',
      accountLast4: '1234',
      mode: 'IMPS',
      upiRef: '627412345678',
    },
  },
  {
    name: 'SBI pre-approved loan promo',
    sender: 'BZ-SBIINB',
    body: 'Dear Customer, you are eligible for SBI Pre-approved Car Loan up to Rs 10 lakh at 8.5%. Apply now on YONO. T&C apply.',
    expected: null,
  },
  {
    name: 'SBI card statement (due date)',
    sender: 'BZ-SBICRD',
    body: 'Your SBI Credit Card ending 5678 statement: Total Amt Due Rs 12,450.00, Min Amt Due Rs 620.00, Payment Due Date 05-Nov-26.',
    expected: null,
  },
  {
    name: 'SBI NACH autopay',
    sender: 'BZ-SBIINB',
    body: 'Dear Customer, Rs 299.00 debited from A/c X1234 for NACH towards SPOTIFY INDIA on 24-10-26. Avl Bal Rs 8,000.00',
    expected: {
      amountPaise: 29900,
      mode: 'AUTOPAY',
      merchant: 'SPOTIFY INDIA',
      balancePaise: 800000,
      category: 'subscriptions',
    },
  },
  {
    name: 'SBI ₹ symbol UPI to IRCTC',
    sender: 'VM-SBIINB',
    body: '₹2,500 debited from A/c XX1234 to irctc@sbi on 24-10-26. UPI Ref 429812345696',
    expected: { amountPaise: 250000, mode: 'UPI', merchant: 'irctc@sbi', category: 'transport' },
  },
  // ---------------------------------------------------------------- Axis
  {
    name: 'Axis UPI P2M multi-line',
    sender: 'AX-AXISBK',
    body: 'INR 300.00 debited\nA/c no. XX1234\n24-10-26, 10:15:32\nUPI/P2M/429812345685/SWIGGY\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank',
    expected: {
      amountPaise: 30000,
      direction: 'debit',
      accountLast4: '1234',
      merchant: 'SWIGGY',
      upiRef: '429812345685',
      mode: 'UPI',
      category: 'food',
    },
  },
  {
    name: 'Axis UPI P2A credit from person',
    sender: 'AX-AXISBK',
    body: 'INR 1,500.00 credited\nA/c no. XX1234\n24-10-26, 18:02:11 IST\nUPI/P2A/429812345686/PRIYA S\nAxis Bank',
    expected: {
      amountPaise: 150000,
      direction: 'credit',
      merchant: 'PRIYA S',
      upiRef: '429812345686',
    },
  },
  {
    name: 'Axis card spend, merchant on its own line',
    sender: 'AX-AXISBK',
    body: 'Spent\nCard no. XX4321\nINR 2,350.00\n24-10-26 20:41:10\nMYNTRA DESIGNS\nAvl Lmt INR 1,45,000.00\nSMS BLOCK 4321 to 919951860002, if not you - Axis Bank',
    expected: {
      amountPaise: 235000,
      accountLast4: '4321',
      merchant: 'MYNTRA DESIGNS',
      mode: 'CARD',
      balancePaise: null,
      category: 'shopping',
    },
  },
  {
    name: 'Axis ATM',
    sender: 'AX-AXISBK',
    body: 'INR 3,000.00 withdrawn from A/c no. XX1234 on 24-10-26 at ATM AXIS KORAMANGALA. Avl Bal INR 21,450.00 - Axis Bank',
    expected: { amountPaise: 300000, mode: 'ATM', balancePaise: 2145000, category: 'cash' },
  },
  {
    name: 'Axis failed UPI',
    sender: 'AX-AXISBK',
    body: 'UPI transaction of INR 500.00 from A/c no. XX1234 to blinkit@axisbank failed on 24-10-26. Amount if debited will be reversed in 3 working days - Axis Bank',
    expected: null,
  },
  {
    name: 'Axis Swiggy Instamart (groceries beats food)',
    sender: 'AX-AXISBK',
    body: 'INR 640.00 debited\nA/c no. XX1234\n24-10-26, 21:11:09\nUPI/P2M/429812345695/Swiggy Instamart\nNot you? SMS BLOCKUPI to 919951860002',
    expected: { amountPaise: 64000, merchant: 'Swiggy Instamart', category: 'groceries' },
  },
  // ---------------------------------------------------------------- Kotak
  {
    name: 'Kotak UPI sent to VPA',
    sender: 'VM-KOTAKB',
    body: 'Sent Rs.250.00 from Kotak Bank AC X1234 to zepto@ybl on 24-10-26.UPI Ref 429812345687. Not you, kotak.com/fraud',
    expected: {
      amountPaise: 25000,
      direction: 'debit',
      accountLast4: '1234',
      merchant: 'zepto@ybl',
      vpa: 'zepto@ybl',
      upiRef: '429812345687',
      category: 'groceries',
    },
  },
  {
    name: 'Kotak UPI received',
    sender: 'VM-KOTAKB',
    body: 'Received Rs.1,200.00 in your Kotak Bank AC X1234 from amit.k@okhdfcbank on 24-10-26.UPI Ref:429812345688.',
    expected: {
      amountPaise: 120000,
      direction: 'credit',
      merchant: 'amit.k@okhdfcbank',
      upiRef: '429812345688',
    },
  },
  {
    name: 'Kotak one time password',
    sender: 'VM-KOTAKB',
    body: "Kotak Bank: 123456 is the One Time Password for transaction of Rs 4,999.00 at CROMA. Don't share OTP with anyone.",
    expected: null,
  },
  {
    name: 'Kotak credit card at BookMyShow',
    sender: 'VM-KOTAKB',
    body: 'Rs.899.00 spent on Kotak Credit Card x4321 at BOOKMYSHOW on 24/10/2026. Avl limit Rs.48,101.00. Not you? Call 18602662666',
    expected: {
      amountPaise: 89900,
      accountLast4: '4321',
      merchant: 'BOOKMYSHOW',
      mode: 'CARD',
      category: 'entertainment',
    },
  },
  // ---------------------------------------------------------------- Paytm Payments Bank
  {
    name: 'Paytm Bank paid with balance',
    sender: 'JM-PAYTMB',
    body: 'Paid Rs.120 to CHAAYOS from Paytm Payments Bank a/c XX7890. UPI Ref: 429812345689. Bal: Rs.2,340.50',
    expected: {
      amountPaise: 12000,
      direction: 'debit',
      merchant: 'CHAAYOS',
      accountLast4: '7890',
      balancePaise: 234050,
      category: 'coffee',
    },
  },
  {
    name: 'Paytm Bank received',
    sender: 'JM-PAYTMB',
    body: 'Received Rs.2,000 in your Paytm Payments Bank a/c XX7890 from RAHUL SHARMA. UPI Ref: 429812345690',
    expected: { amountPaise: 200000, direction: 'credit', merchant: 'RAHUL SHARMA' },
  },
  {
    name: 'Paytm cashback promo',
    sender: 'JM-PAYTMB',
    body: 'Win up to Rs.1000 cashback on your next bill payment with Paytm! Offer valid till 31 Oct. T&C apply',
    expected: null,
  },
  // ---------------------------------------------------------------- IDFC FIRST
  {
    name: 'IDFC UPI to Uber',
    sender: 'VM-IDFCFB',
    body: 'Your A/C XXXXXXX1234 is debited by INR 560.00 on 24-10-26 10:22 via UPI to UBER INDIA. UPI Ref No 429812345691. Avl Bal INR 15,000.00 - IDFC FIRST Bank',
    expected: {
      amountPaise: 56000,
      merchant: 'UBER INDIA',
      upiRef: '429812345691',
      balancePaise: 1500000,
      category: 'transport',
    },
  },
  {
    name: 'IDFC IMPS to a person',
    sender: 'VM-IDFCFB',
    body: 'Your A/C XXXXXXX1234 is debited by INR 10,000.00 on 24-10-26 via IMPS to RAVI KUMAR. IMPS Ref No 629812345692. Avl Bal INR 5,000.00',
    expected: {
      amountPaise: 1000000,
      mode: 'IMPS',
      merchant: 'RAVI KUMAR',
      upiRef: '629812345692',
      category: 'transfers',
    },
  },
  {
    name: 'IDFC credit card at pharmacy',
    sender: 'VM-IDFCFB',
    body: 'INR 3,450.00 spent on your IDFC FIRST Bank Credit Card XX4321 at APOLLO PHARMACY on 24-OCT-2026 at 13:05. Avl Limit: INR 50,000',
    expected: {
      amountPaise: 345000,
      merchant: 'APOLLO PHARMACY',
      mode: 'CARD',
      category: 'health',
    },
  },
  // ---------------------------------------------------------------- YES Bank
  {
    name: 'YES UPI to Rapido',
    sender: 'VK-YESBNK',
    body: 'INR 180.00 debited from A/c XX1234 on 24-10-26 for UPI txn to RAPIDO. UPI Ref:429812345693. Avl Bal: INR 9,820.00 -YES BANK',
    expected: {
      amountPaise: 18000,
      merchant: 'RAPIDO',
      upiRef: '429812345693',
      balancePaise: 982000,
      category: 'transport',
    },
  },
  {
    name: 'YES NEFT credit',
    sender: 'VK-YESBNK',
    body: 'INR 50,000.00 credited to A/c XX1234 on 01-10-26 via NEFT from ACME CORP. Avl Bal: INR 62,000.00 -YES BANK',
    expected: { amountPaise: 5000000, direction: 'credit', mode: 'NEFT', merchant: 'ACME CORP' },
  },
  {
    name: 'YES EMI reminder',
    sender: 'VK-YESBNK',
    body: 'Reminder: INR 15,000.00 EMI will be debited from your A/c XX1234 on 05-11-26. Please maintain sufficient balance.',
    expected: null,
  },
  // ---------------------------------------------------------------- Other rejections
  {
    name: 'reversal after technical failure',
    sender: 'VM-HDFCBK',
    body: 'Rs 500.00 debited from your A/c XX1234 for UPI txn 429812345697 has been reversed due to technical failure.',
    expected: null,
  },
  {
    name: 'balance enquiry (no movement)',
    sender: 'VM-HDFCBK',
    body: 'Your A/c XX1234 balance as on 24-10-26 is Rs.45,000.00',
    expected: null,
  },
  {
    name: 'personal chat number',
    sender: '+919876543210',
    body: 'Bro send Rs 500 for dinner, paid to the restaurant already',
    expected: null,
  },
  {
    name: 'non-bank brand header',
    sender: 'VM-SWIGGY',
    body: 'Your order of Rs 450 is confirmed and paid via UPI',
    expected: null,
  },
  {
    name: 'merchant wallet header',
    sender: 'AD-AMAZON',
    body: 'Rs 1,299 refund credited to your Amazon Pay balance',
    expected: null,
  },
  {
    name: 'bank header without operator prefix',
    sender: 'HDFCBK',
    body: 'Sent Rs.300.00 From HDFC Bank A/C *1234 To ZOMATO Ref 429812345600',
    expected: null,
  },
  {
    name: 'look-alike header',
    sender: 'VM-HDFCBKX',
    body: 'Sent Rs.300.00 From HDFC Bank A/C *1234 To ZOMATO Ref 429812345601',
    expected: null,
  },
];

describe('parseSms fixtures', () => {
  it('has at least 40 samples', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
  });

  it.each(CASES.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const result = parseSms(c.sender, c.body, RECEIVED_AT);
    if (c.expected === null) {
      expect(result).toBeNull();
      return;
    }
    expect(result).not.toBeNull();
    if (!result) return;

    const { category, ...fields } = c.expected;
    expect(result).toMatchObject({ ...fields, occurredAt: RECEIVED_AT, source: 'sms' });
    expect(Number.isInteger(result.amountPaise)).toBe(true);

    if (category) {
      const { category: actual } = categorise(
        {
          merchantNorm: normaliseMerchant(result.merchant, result.vpa),
          vpa: result.vpa,
          mode: result.mode,
          direction: result.direction,
        },
        [],
      );
      expect(actual).toBe(category);
    }
  });

  it('never includes the raw body in the output', () => {
    const body = 'Sent Rs.300.00 From HDFC Bank A/C *1234 To ZOMATO On 24/10/26 Ref 429812345678';
    const result = parseSms('VM-HDFCBK', body, RECEIVED_AT);
    expect(JSON.stringify(result)).not.toContain('Sent Rs.300.00');
  });
});

describe('isBankSender', () => {
  it.each(['VM-HDFCBK', 'AD-SBIUPI', 'jd-icicib', 'VK-YESBNK-S', 'BZ-IDFCFB', 'AX-AXISBK'])(
    'accepts %s',
    (s) => expect(isBankSender(s)).toBe(true),
  );
  it.each(['HDFCBK', 'VM-HDFCBK1', '+919999999999', 'VM-AMAZON', 'VMX-HDFCBK', 'V-HDFCBK', ''])(
    'rejects %s',
    (s) => expect(isBankSender(s)).toBe(false),
  );
});

describe('parseNotification', () => {
  it('parses a Google Pay payment', () => {
    const r = parseNotification(
      'com.google.android.apps.nbu.paisa.user',
      'Paid ₹300 to Third Wave Coffee',
      'UPI transaction ID 429812345678',
      RECEIVED_AT,
    );
    expect(r).toMatchObject({
      amountPaise: 30000,
      direction: 'debit',
      merchant: 'Third Wave Coffee',
      upiRef: '429812345678',
      source: 'notification',
      accountLast4: null,
    });
  });

  it('parses a PhonePe receipt', () => {
    const r = parseNotification(
      'com.phonepe.app',
      'Received ₹500',
      'from Rahul Sharma',
      RECEIVED_AT,
    );
    expect(r).toMatchObject({ amountPaise: 50000, direction: 'credit', merchant: 'Rahul Sharma' });
  });

  it('parses a Paytm payment without a reference', () => {
    const r = parseNotification(
      'net.one97.paytm',
      'Payment successful',
      'Paid Rs.120 to Chaayos',
      RECEIVED_AT,
    );
    expect(r).toMatchObject({ amountPaise: 12000, merchant: 'Chaayos', upiRef: null });
  });

  it('ignores collect requests and failures', () => {
    expect(
      parseNotification(
        'com.phonepe.app',
        'Payment request',
        'Ravi has requested ₹200',
        RECEIVED_AT,
      ),
    ).toBeNull();
    expect(
      parseNotification('com.phonepe.app', 'Payment failed', '₹300 to Zomato failed', RECEIVED_AT),
    ).toBeNull();
  });

  it('ignores apps that are not on the allow-list', () => {
    expect(
      parseNotification('com.whatsapp', 'Rahul', 'Paid ₹300 to Third Wave Coffee', RECEIVED_AT),
    ).toBeNull();
  });
});
