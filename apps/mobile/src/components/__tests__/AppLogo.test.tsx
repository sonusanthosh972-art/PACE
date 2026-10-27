import { render, screen } from '@testing-library/react-native';
import { AppLogo } from '../AppLogo';

describe('AppLogo', () => {
  it('renders mark variant with accessibility label', async () => {
    await render(<AppLogo variant="mark" size={50} />);
    expect(screen.getByLabelText('Paisa Pulse logo mark')).toBeOnTheScreen();
  });

  it('renders full variant with brand text', async () => {
    await render(<AppLogo variant="full" tagline="Daily Peace" />);
    expect(screen.getByText('Paisa Pulse')).toBeOnTheScreen();
    expect(screen.getByText('Daily Peace')).toBeOnTheScreen();
  });

  it('renders hero variant with PACE badge', async () => {
    await render(<AppLogo variant="hero" tagline="Private · Simple · Honest" />);
    expect(screen.getByText('Paisa Pulse')).toBeOnTheScreen();
    expect(screen.getByText('PACE ENGINE')).toBeOnTheScreen();
    expect(screen.getByText('Private · Simple · Honest')).toBeOnTheScreen();
  });
});
