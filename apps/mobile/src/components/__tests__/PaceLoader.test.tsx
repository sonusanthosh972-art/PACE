import { render, screen } from '@testing-library/react-native';

import { BRAND } from '@/theme/brand';

import { PaceLoader } from '../PaceLoader';
import { LoadingState } from '../States';

// The loader is decorative (hidden from screen readers), so queries opt in to see it.
const HIDDEN = { includeHiddenElements: true };

const mockReduced = { value: false };
jest.mock('@/theme/ThemeProvider', () => {
  const { COLORS } = jest.requireActual<typeof import('@/theme/tokens')>('@/theme/tokens');
  return { useTheme: () => ({ colors: COLORS, reducedMotion: mockReduced.value }) };
});

beforeEach(() => {
  mockReduced.value = false;
});

describe('PaceLoader', () => {
  it('plays the supplied PACE animation while a page loads', async () => {
    await render(<PaceLoader />);
    const image = screen.getByTestId('pace-loader-image', HIDDEN);
    expect(image.props.source).toEqual([BRAND.animation]);
    expect(image.props.autoplay).toBe(true);
  });

  it('shows the finished logo still with Reduce Motion', async () => {
    mockReduced.value = true;
    await render(<PaceLoader />);
    const image = screen.getByTestId('pace-loader-image', HIDDEN);
    expect(image.props.source).toEqual([BRAND.animationFinalFrame]);
    expect(image.props.autoplay).toBe(false);
  });
});

describe('LoadingState', () => {
  it('is announced as progress with what is loading', async () => {
    await render(<LoadingState label="Loading today's budget" />);
    expect(screen.getByRole('progressbar', { name: "Loading today's budget" })).toBeOnTheScreen();
  });
});
