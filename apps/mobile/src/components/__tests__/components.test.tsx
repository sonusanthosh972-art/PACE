import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Transaction } from '@/domain/transaction';
import { resolveScheme } from '@/theme/ThemeProvider';

import { Chip } from '../Chip';
import { MoneyField } from '../Fields';
import { TransactionRow } from '../TransactionRow';

const tx: Transaction = {
  id: 'a',
  amountPaise: 30000,
  direction: 'debit',
  accountLast4: '1234',
  merchant: 'Third Wave Coffee',
  merchantNorm: 'third wave coffee',
  vpa: null,
  mode: 'UPI',
  upiRef: null,
  balancePaise: null,
  category: 'coffee',
  needsReview: false,
  note: null,
  source: 'sms',
  occurredAt: Date.UTC(2026, 9, 24, 4, 45),
  dedupeHash: 'f'.repeat(64),
  isExcluded: false,
  createdAt: 1,
  updatedAt: 1,
};

describe('TransactionRow', () => {
  it('shows merchant, amount and category, and a full spoken description', async () => {
    const onPress = jest.fn();
    await render(<TransactionRow tx={tx} onPress={onPress} />);
    expect(screen.getByText('Third Wave Coffee')).toBeOnTheScreen();
    expect(screen.getByText('₹300')).toBeOnTheScreen();
    expect(screen.getByText(/Coffee & Snacks · UPI · 10:15 am/)).toBeOnTheScreen();
    const button = screen.getByRole('button', {
      name: 'Spent ₹300, at Third Wave Coffee, Coffee & Snacks, 10:15 am',
    });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalled();
  });

  it('flags rows that need a category and credits with a plus sign', async () => {
    await render(
      <TransactionRow
        tx={{ ...tx, needsReview: true, category: 'uncategorised', direction: 'credit' }}
      />,
    );
    expect(screen.getByText(/Tap to tag/)).toBeOnTheScreen();
    expect(screen.getByText('+₹300')).toBeOnTheScreen();
  });

  it('marks excluded rows in text, not colour alone', async () => {
    await render(<TransactionRow tx={{ ...tx, isExcluded: true }} />);
    expect(screen.getByText('Not counted')).toBeOnTheScreen();
  });
});

describe('MoneyField', () => {
  it('hands back integer paise as the user types', async () => {
    const onChange = jest.fn();
    await render(<MoneyField label="Amount" valuePaise={null} onChangePaise={onChange} />);
    const input = screen.getByLabelText('Amount, in rupees');
    await fireEvent.changeText(input, '1,250.5');
    expect(onChange).toHaveBeenLastCalledWith(125050);
    await fireEvent.changeText(input, '');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('Chip', () => {
  it('exposes selection to screen readers and shows a check mark', async () => {
    await render(<Chip label="UPI" selected onPress={jest.fn()} />);
    const chip = screen.getByRole('button', { name: 'UPI' });
    expect(chip).toBeSelected();
    expect(screen.getByText('✓ UPI')).toBeOnTheScreen();
  });
});

describe('theme', () => {
  it('follows the system by default (dark when unknown) and honours the override', () => {
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('dark');
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
  });
});
