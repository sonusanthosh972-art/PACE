/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react-native';

import { PaceLogo } from '../PaceLogo';

const SVG_PATH = join(__dirname, '../../../../assets/gemini-svg.svg');
const mockSvgFile = readFileSync(SVG_PATH, 'utf8');

const mockWebViewProps = jest.fn();
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WebView: (props: { source: { html: string } }) => {
      mockWebViewProps(props);
      return <View testID="logo-webview" />;
    },
  };
});
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({ downloadAsync: async () => undefined, localUri: 'file:///logo.svg' }),
  },
}));
jest.mock('expo-file-system', () => ({
  File: class {
    async text() {
      return mockSvgFile;
    }
  },
}));

const mockReduced = { value: false };
jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({ reducedMotion: mockReduced.value }),
}));

beforeEach(() => {
  mockWebViewProps.mockClear();
  mockReduced.value = false;
});

function lastHtml(): string {
  const call = mockWebViewProps.mock.calls.at(-1);
  if (!call) throw new Error('WebView not rendered');
  return (call[0] as { source: { html: string } }).source.html;
}

describe('PaceLogo', () => {
  it('renders the untouched gemini-svg.svg, including its CSS keyframe animation', async () => {
    await render(<PaceLogo width={340} />);
    expect(await screen.findByTestId('logo-webview')).toBeOnTheScreen();
    const html = lastHtml();
    expect(html).toContain(mockSvgFile);
    for (const keyframes of ['slideP', 'emergeA', 'emergeC', 'emergeE']) {
      expect(html).toContain(`@keyframes ${keyframes}`);
    }
    expect(html).not.toContain('animation-play-state: paused');
    expect(screen.getByRole('image', { name: 'Paisa Pulse' })).toBeOnTheScreen();
  });

  it('waits to mount until it can be seen (play=false while the splash is up)', async () => {
    await render(<PaceLogo width={340} play={false} />);
    await Promise.resolve();
    expect(screen.queryByTestId('logo-webview')).toBeNull();
  });

  it('freezes on the fully formed word when Reduce Motion is on', async () => {
    mockReduced.value = true;
    await render(<PaceLogo width={340} />);
    await screen.findByTestId('logo-webview');
    expect(lastHtml()).toContain('animation-play-state: paused !important');
  });
});
