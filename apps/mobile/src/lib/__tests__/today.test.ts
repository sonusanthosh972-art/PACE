import { statusCopy } from '../today';

const base = { usedRatio: 0.2, budgetPaise: 1_033_00, streak: 0, yesterday: null };

describe('statusCopy', () => {
  it('reassures when on track, mentioning a streak or yesterday when there is one', () => {
    expect(statusCopy({ ...base, tone: 'ok' }).title).toBe('You’re right on track');
    expect(statusCopy({ ...base, tone: 'ok', streak: 5 }).body).toBe(
      '5 days in a row within your allowance.',
    );
    expect(
      statusCopy({ ...base, tone: 'ok', yesterday: 'Yesterday: ₹500 spent (₹533 saved)' }).body,
    ).toBe('Yesterday: ₹500 spent (₹533 saved)');
  });

  it('is gentle when close to or over the allowance', () => {
    expect(statusCopy({ ...base, tone: 'warn', usedRatio: 0.84 }).body).toBe(
      'You’ve used 84% of today’s allowance.',
    );
    const over = statusCopy({ ...base, tone: 'over', usedRatio: 1.3 });
    expect(over.title).toBe('A little over today');
    expect(`${over.title} ${over.body}`).not.toMatch(/overspent|bad|fail/i);
  });

  it('explains a zero allowance instead of showing a warning', () => {
    expect(statusCopy({ ...base, tone: 'over', budgetPaise: 0 }).title).toBe(
      'Your allowance is resting',
    );
  });
});
