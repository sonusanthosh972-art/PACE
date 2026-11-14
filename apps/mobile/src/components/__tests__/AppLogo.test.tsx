import { render, screen } from '@testing-library/react-native';
import { AppLogo } from '../AppLogo';

describe('AppLogo', () => {
  it('renders mark variant with accessibility label', async () => {
    await render(<AppLogo variant="mark" size={50} />);
    expect(screen.getByLabelText('PACE logo mark')).toBeOnTheScreen();
  });

  it('renders full variant with brand text', async () => {
    await render(<AppLogo variant="full" tagline="Daily Peace" />);
    expect(screen.getByText('PACE')).toBeOnTheScreen();
    expect(screen.getByText('Daily Peace')).toBeOnTheScreen();
  });

  it('renders hero variant with the PACE name once (no repeated badge)', async () => {
    await render(<AppLogo variant="hero" tagline="Private · Simple · Honest" />);
    expect(screen.getAllByText(/PACE/)).toHaveLength(1);
    expect(screen.getByText('Private · Simple · Honest')).toBeOnTheScreen();
  });
});
