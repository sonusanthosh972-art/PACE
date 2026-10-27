import { detectSubscriptions } from '../subscriptions';

describe('subscriptions', () => {
  const OCT_15 = new Date('2026-10-15T12:00:00Z').getTime();
  const SEP_15 = new Date('2026-09-15T12:00:00Z').getTime();

  it('detects autopay / e-mandate transactions with high confidence', () => {
    const results = detectSubscriptions([
      {
        amountPaise: 649_00,
        direction: 'debit',
        occurredAt: OCT_15,
        merchant: 'NETFLIX',
        note: 'debited for Autopay (E-Mandate)',
      },
    ]);

    expect(results.length).toBe(1);
    const first = results[0]!;
    expect(first.name).toBe('Netflix');
    expect(first.amountPaise).toBe(649_00);
    expect(first.dueDay).toBe(15);
    expect(first.confidence).toBe('high');
  });

  it('detects known services like Spotify, Prime, Hotstar', () => {
    const results = detectSubscriptions([
      {
        amountPaise: 119_00,
        direction: 'debit',
        occurredAt: OCT_15,
        merchant: 'SPOTIFY INDIA',
      },
    ]);

    expect(results.length).toBe(1);
    const first = results[0]!;
    expect(first.name).toBe('Spotify');
    expect(first.amountPaise).toBe(119_00);
    expect(first.confidence).toBe('medium');
  });

  it('detects SIP investments and EMIs', () => {
    const results = detectSubscriptions([
      {
        amountPaise: 5000_00,
        direction: 'debit',
        occurredAt: OCT_15,
        merchant: 'GROWW MUTUAL FUND',
      },
      {
        amountPaise: 14500_00,
        direction: 'debit',
        occurredAt: OCT_15,
        merchant: 'BAJAJ FINSERV LOAN EMI',
      },
    ]);

    expect(results.length).toBe(2);
    expect(results.some((r) => r.name === 'Bajaj Finserv EMI' && r.amountPaise === 14500_00)).toBe(
      true,
    );
    expect(results.some((r) => r.name === 'SIP Investment' && r.amountPaise === 5000_00)).toBe(
      true,
    );
  });

  it('detects recurring monthly debits even for arbitrary merchants', () => {
    const results = detectSubscriptions([
      {
        amountPaise: 3500_00,
        direction: 'debit',
        occurredAt: OCT_15,
        merchantNorm: 'local_gym',
        merchant: 'Local Fitness Club',
      },
      {
        amountPaise: 3500_00,
        direction: 'debit',
        occurredAt: SEP_15,
        merchantNorm: 'local_gym',
        merchant: 'Local Fitness Club',
      },
    ]);

    expect(results.length).toBe(1);
    const first = results[0]!;
    expect(first.name).toBe('Local Fitness Club');
    expect(first.amountPaise).toBe(3500_00);
    expect(first.dueDay).toBe(15);
    expect(first.reason).toBe('recurring');
  });

  it('ignores credit transactions', () => {
    const results = detectSubscriptions([
      {
        amountPaise: 649_00,
        direction: 'credit',
        occurredAt: OCT_15,
        merchant: 'NETFLIX REFUND',
      },
    ]);

    expect(results.length).toBe(0);
  });
});
