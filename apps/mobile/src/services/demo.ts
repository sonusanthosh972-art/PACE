import type { SqlDb } from '@/data/db';
import { replaceFixedExpenses, saveProfile } from '@/data/profileRepo';
import { setSetting } from '@/data/settingsRepo';
import { ingestParsed, type Clock } from '@/data/transactionsRepo';
import { cycleFor } from '@/domain/budget';
import { addDays, atTimeMs, toDateKey } from '@/domain/time';
import type { Mode, ParsedTransaction } from '@/domain/transaction';

/** Deterministic pseudo-random numbers so demo data is identical on every device and in tests. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Template {
  merchant: string;
  vpa: string | null;
  min: number; // rupees
  max: number;
  mode: Mode;
  hours: [number, number];
  weight: number;
}

const TEMPLATES: Template[] = [
  {
    merchant: 'Third Wave Coffee',
    vpa: 'thirdwave@ybl',
    min: 180,
    max: 420,
    mode: 'UPI',
    hours: [8, 11],
    weight: 5,
  },
  {
    merchant: 'Zepto',
    vpa: 'zepto@ybl',
    min: 90,
    max: 780,
    mode: 'UPI',
    hours: [9, 22],
    weight: 6,
  },
  {
    merchant: 'Blinkit',
    vpa: 'blinkit@hdfcbank',
    min: 120,
    max: 650,
    mode: 'UPI',
    hours: [10, 22],
    weight: 3,
  },
  {
    merchant: 'Swiggy',
    vpa: 'swiggy@icici',
    min: 220,
    max: 690,
    mode: 'UPI',
    hours: [12, 22],
    weight: 5,
  },
  {
    merchant: 'Zomato',
    vpa: 'zomato@hdfcbank',
    min: 250,
    max: 820,
    mode: 'UPI',
    hours: [13, 23],
    weight: 3,
  },
  {
    merchant: 'Uber',
    vpa: 'uber@axisbank',
    min: 140,
    max: 560,
    mode: 'UPI',
    hours: [8, 21],
    weight: 4,
  },
  {
    merchant: 'Rapido',
    vpa: 'rapido@ybl',
    min: 45,
    max: 160,
    mode: 'UPI',
    hours: [8, 20],
    weight: 3,
  },
  { merchant: 'Amazon', vpa: null, min: 399, max: 2499, mode: 'CARD', hours: [11, 23], weight: 2 },
  {
    merchant: 'Chaayos',
    vpa: 'chaayos@paytm',
    min: 60,
    max: 240,
    mode: 'UPI',
    hours: [16, 19],
    weight: 3,
  },
  {
    merchant: 'Apollo Pharmacy',
    vpa: null,
    min: 150,
    max: 900,
    mode: 'CARD',
    hours: [10, 20],
    weight: 1,
  },
  {
    merchant: 'BookMyShow',
    vpa: null,
    min: 300,
    max: 900,
    mode: 'CARD',
    hours: [18, 22],
    weight: 1,
  },
];

function pick(rand: () => number): Template {
  const total = TEMPLATES.reduce((s, t) => s + t.weight, 0);
  let r = rand() * total;
  for (const t of TEMPLATES) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return TEMPLATES[0] as Template;
}

/** Sample data for the current cycle (for trying the app without real SMS, e.g. on an emulator). */
export async function loadDemoData(db: SqlDb, clock: Clock): Promise<number> {
  await saveProfile(
    db,
    { monthlySalaryPaise: 1_00_000_00, payday: 1, monthlySavingsGoalPaise: 10_000_00 },
    clock,
  );
  await replaceFixedExpenses(
    db,
    [
      { name: 'Rent', amountPaise: 30_000_00, dueDay: 5 },
      { name: 'Car EMI', amountPaise: 8_000_00, dueDay: 10 },
      { name: 'Netflix + Spotify', amountPaise: 800_00, dueDay: 12 },
    ],
    clock,
  );

  const rand = mulberry32(42);
  const now = clock.now();
  const today = toDateKey(now);
  const start = cycleFor(today, 1).start;
  let count = 0;
  let ref = 429_800_000_000;

  for (let day = start; day <= today; day = addDays(day, 1)) {
    const perDay = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < perDay; i += 1) {
      const t = pick(rand);
      const hour = t.hours[0] + Math.floor(rand() * (t.hours[1] - t.hours[0] + 1));
      const at = atTimeMs(day, hour, Math.floor(rand() * 60));
      if (at > now) continue;
      const rupees = t.min + Math.floor(rand() * (t.max - t.min));
      ref += 1 + Math.floor(rand() * 1000);
      const parsed: ParsedTransaction = {
        amountPaise: rupees * 100,
        direction: 'debit',
        accountLast4: t.mode === 'CARD' ? '4321' : '1234',
        merchant: t.merchant,
        vpa: t.vpa,
        mode: t.mode,
        upiRef: t.mode === 'UPI' ? String(ref) : null,
        balancePaise: null,
        occurredAt: at,
        source: 'sms',
      };
      const res = await ingestParsed(db, parsed, clock);
      if (res.status === 'inserted') count += 1;
    }
  }

  await setSetting(db, 'demoMode', true);
  await setSetting(db, 'onboardingComplete', true);
  return count;
}
