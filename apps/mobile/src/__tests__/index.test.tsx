import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';

describe('Index screen', () => {
  it('renders the app name', async () => {
    await render(<Index />);
    expect(screen.getByText('Paisa Pulse')).toBeOnTheScreen();
  });
});
