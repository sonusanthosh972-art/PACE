import { act, render, screen } from '@testing-library/react-native';

import { BRAND, BRAND_ANIMATION_BG, BRAND_ANIMATION_MS } from '@/theme/brand';

import { DEFAULT_DWELL_MS, SPLASH_TIMING, SplashScreenView } from '../SplashScreenView';

const mockReduced = { value: false };
jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({ reducedMotion: mockReduced.value }),
}));

describe('SplashScreenView', () => {
  beforeEach(() => {
    mockReduced.value = false;
    jest.useRealTimers();
  });

  it('plays the supplied GIF on its own background, with nothing else on screen', async () => {
    await render(<SplashScreenView ready={false} />);
    expect(screen.getByTestId('splash-screen-view')).toHaveStyle({
      backgroundColor: BRAND_ANIMATION_BG,
    });
    const gif = screen.getByTestId('splash-animation');
    expect(gif.props.source).toEqual([BRAND.animation]);
    expect(gif.props.autoplay).toBe(true);
    // Square asset, square box: never stretched.
    expect(gif.props.contentFit).toBe('contain');
    expect(screen.queryByTestId('splash-final-frame')).toBeNull();
  });

  it('holds the finished logo after one play of the animation (the GIF itself loops)', async () => {
    jest.useFakeTimers();
    await render(<SplashScreenView ready={false} />);
    await act(async () => {
      jest.advanceTimersByTime(SPLASH_TIMING.animationMs);
    });
    expect(screen.getByTestId('splash-final-frame').props.source).toEqual([
      BRAND.animationFinalFrame,
    ]);
    jest.useRealTimers();
  });

  it('times one play to the GIF (9 frames × 180 ms) plus a short hold', () => {
    expect(SPLASH_TIMING.animationMs).toBe(BRAND_ANIMATION_MS);
    expect(BRAND_ANIMATION_MS).toBe(9 * 180);
    expect(DEFAULT_DWELL_MS + SPLASH_TIMING.fadeOutMs).toBeLessThanOrEqual(2500);
  });

  it('waits for the app to be ready, then finishes', async () => {
    const onFinish = jest.fn();
    const view = await render(<SplashScreenView ready={false} onFinish={onFinish} dwellMs={10} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(onFinish).not.toHaveBeenCalled();
    await view.rerender(<SplashScreenView ready onFinish={onFinish} dwellMs={10} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(onFinish).toHaveBeenCalled();
  });

  it('shows the finished logo at once and skips the wait with Reduce Motion', async () => {
    mockReduced.value = true;
    const onFinish = jest.fn();
    await render(<SplashScreenView ready onFinish={onFinish} />);
    expect(screen.getByTestId('splash-final-frame')).toBeTruthy();
    await Promise.resolve();
    expect(onFinish).toHaveBeenCalled();
  });
});
