import { detectSalaryCandidate } from '../salaryDetector';

describe('salaryDetector', () => {
  const NOV_1 = new Date('2026-11-01T10:00:00Z').getTime();
  const OCT_1 = new Date('2026-10-01T10:00:00Z').getTime();

  it('detects high-confidence salary credit with keyword in note/merchant', () => {
    const candidate = detectSalaryCandidate([
      {
        amountPaise: 85_000_00,
        direction: 'credit',
        occurredAt: OCT_1,
        merchant: 'INF*NEFT*ACME PVT LTD*SALARY',
      },
    ]);

    expect(candidate).not.toBeNull();
    expect(candidate?.salaryPaise).toBe(85_000_00);
    expect(candidate?.payday).toBe(1);
    expect(candidate?.confidence).toBe('high');
  });

  it('detects high-confidence salary credit with SAL CR keyword', () => {
    const candidate = detectSalaryCandidate([
      {
        amountPaise: 1_20_000_00,
        direction: 'credit',
        occurredAt: new Date('2026-10-28T12:00:00Z').getTime(),
        note: 'BY SAL CR HDFC BANK',
      },
    ]);

    expect(candidate).not.toBeNull();
    expect(candidate?.salaryPaise).toBe(1_20_000_00);
    expect(candidate?.payday).toBe(28);
    expect(candidate?.confidence).toBe('high');
  });

  it('detects recurring monthly credits as medium confidence salary', () => {
    const candidate = detectSalaryCandidate([
      {
        amountPaise: 65_000_00,
        direction: 'credit',
        occurredAt: NOV_1,
        merchant: 'GLOBAL ENTERPRISE TRANSFER',
      },
      {
        amountPaise: 65_000_00,
        direction: 'credit',
        occurredAt: OCT_1,
        merchant: 'GLOBAL ENTERPRISE TRANSFER',
      },
    ]);

    expect(candidate).not.toBeNull();
    expect(candidate?.salaryPaise).toBe(65_000_00);
    expect(candidate?.payday).toBe(1);
    expect(candidate?.confidence).toBe('medium');
  });

  it('ignores debits even if salary keyword is present', () => {
    const candidate = detectSalaryCandidate([
      {
        amountPaise: 15_000_00,
        direction: 'debit',
        occurredAt: OCT_1,
        merchant: 'MAID SALARY TRANSFER',
      },
    ]);

    expect(candidate).toBeNull();
  });

  it('ignores small credits below ₹10,000 threshold', () => {
    const candidate = detectSalaryCandidate([
      {
        amountPaise: 500_00,
        direction: 'credit',
        occurredAt: OCT_1,
        note: 'Salary referral bonus',
      },
    ]);

    expect(candidate).toBeNull();
  });
});
