import { render, screen } from '@testing-library/react-native';

import { LOADER_FORMED_MS, PACE_LOOP_MS, PaceLoader } from '../PaceLoader';
import { FORMED_MS } from '../SplashScreenView';
import { LoadingState } from '../States';

// The loader is decorative (hidden from screen readers), so queries opt in to see it.
const HIDDEN = { includeHiddenElements: true };

describe('PaceLoader', () => {
  it('spells PACE: the logo mark followed by A, C and E', async () => {
    await render(<PaceLoader />);
    for (const letter of ['A', 'C', 'E']) {
      expect(screen.getByText(letter, HIDDEN)).toBeOnTheScreen();
    }
    expect(screen.getByLabelText('Paisa Pulse logo mark', HIDDEN)).toBeOnTheScreen();
  });

  it('draws every letter, P included, in one colour on a button', async () => {
    await render(<PaceLoader size="sm" color="#16171A" />);
    for (const letter of ['P', 'A', 'C', 'E']) {
      expect(screen.getByText(letter, HIDDEN)).toHaveStyle({ color: '#16171A' });
    }
  });

  it('loops the splash motion faster, so PACE forms within about a second', () => {
    expect(LOADER_FORMED_MS).toBe(FORMED_MS / 2);
    expect(LOADER_FORMED_MS).toBeLessThanOrEqual(1000);
    expect(PACE_LOOP_MS).toBeGreaterThan(LOADER_FORMED_MS);
    expect(PACE_LOOP_MS).toBeLessThan(2000);
  });
});

describe('LoadingState', () => {
  it('is announced as progress with what is loading', async () => {
    await render(<LoadingState label="Loading today's budget" />);
    expect(screen.getByRole('progressbar', { name: "Loading today's budget" })).toBeOnTheScreen();
  });
});
