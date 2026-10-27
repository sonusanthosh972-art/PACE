import { act, render, screen } from '@testing-library/react-native';

import { DEFAULT_DWELL_MS, FORMED_MS, SPLASH_TIMING, SplashScreenView } from '../SplashScreenView';

const mockReduced = { value: false };
jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({ reducedMotion: mockReduced.value }),
}));

describe('SplashScreenView', () => {
  beforeEach(() => {
    mockReduced.value = false;
  });

  it('renders only the PACE logo animation against #0B0D11 and omits secondary copy/decorations', async () => {
    await render(<SplashScreenView ready={false} />);

    // Screen and webview are present
    expect(screen.getByTestId('splash-screen-view')).toBeOnTheScreen();
    const webview = screen.getByTestId('splash-logo-webview');
    expect(webview).toBeOnTheScreen();

    // Verify background color is strictly #0B0D11
    expect(screen.getByTestId('splash-screen-view')).toHaveStyle({
      backgroundColor: '#0B0D11',
    });

    const html = (webview.props as { source: { html: string } }).source.html;

    // Artwork, colours, proportions and background are the SVG's own, unchanged
    expect(html).toContain('viewBox="0 0 1000 500"');
    expect(html).toContain('<rect width="1000" height="500" class="bg-rect" />');
    expect(html).toContain('M 452 198 L 478 186 L 478 310 L 452 322 Z');
    expect(html).toContain('<stop offset="50%" stop-color="#10E896" />');
    expect(html).toContain('<stop offset="65%" stop-color="#F1F5F9" />');
    for (const [char, x] of [
      ['A', 435],
      ['C', 555],
      ['E', 670],
    ] as const) {
      expect(html).toContain(`<text x="${x}" y="250" class="real-letter">${char}</text>`);
    }

    // Coin-travel sequence: P darts in from the right and settles left, then A, C, E slide in
    expect(html).toContain('@keyframes coinP');
    expect(html).toContain(`translateX(${SPLASH_TIMING.pStartX}px)`);
    expect(html).toContain(`translateX(${SPLASH_TIMING.pFinalX}px) skewX(0deg) scale(1)`);
    expect(html).toContain('@keyframes letterIn');
    expect(html).toContain(`.char-a { animation-delay: ${SPLASH_TIMING.lettersStartMs}ms; }`);
    // Plays once; never loops
    expect(html).not.toContain('infinite');

    // Ensure removed elements are NOT rendered
    expect(screen.queryByText('Daily financial peace of mind.')).toBeNull();
    expect(screen.queryByText('Simple, honest guidance tailored for everyday life.')).toBeNull();
    expect(screen.queryByText(/100% Offline-first/)).toBeNull();
    expect(screen.queryByText('Opening your safe space…')).toBeNull();
    expect(screen.queryByText('Ready')).toBeNull();
  });

  it('times the sequence to complete the whole process in 4.0 seconds', () => {
    expect(SPLASH_TIMING.pStartX).toBeGreaterThan(500); // fully off the right edge of the 1000-wide viewBox
    expect(SPLASH_TIMING.pFinalX).toBe(-185); // the SVG's own final P position (x = 315)
    expect(SPLASH_TIMING.lettersStartMs).toBeLessThanOrEqual(SPLASH_TIMING.pEnterMs);
    expect(SPLASH_TIMING.lettersStartMs).toBeGreaterThan(SPLASH_TIMING.pEnterMs * 0.8);
    expect(FORMED_MS).toBe(
      SPLASH_TIMING.lettersStartMs + 2 * SPLASH_TIMING.letterStaggerMs + SPLASH_TIMING.letterMs,
    );
    expect(DEFAULT_DWELL_MS).toBe(FORMED_MS + SPLASH_TIMING.holdMs);
    // Entire process (intro + hold + fade out) completes in exactly 4.0 seconds
    expect(DEFAULT_DWELL_MS + SPLASH_TIMING.fadeOutMs).toBe(4000);
  });

  it('dismisses via onFinish after dwell time and exit animation', async () => {
    const onFinish = jest.fn();
    await render(<SplashScreenView ready={true} onFinish={onFinish} dwellMs={10} />);

    expect(onFinish).not.toHaveBeenCalled();

    // Allow dwell time (10ms) and fade out animation to finish
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(onFinish).toHaveBeenCalled();
  });

  it('skips dwell and motion when reduced motion is enabled', async () => {
    mockReduced.value = true;
    const onFinish = jest.fn();
    await render(<SplashScreenView ready={true} onFinish={onFinish} />);

    await Promise.resolve();
    expect(onFinish).toHaveBeenCalled();
  });
});
