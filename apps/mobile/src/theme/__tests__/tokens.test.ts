import { contrastRatio, PALETTES, type ColorScheme } from '../tokens';

const SCHEMES: ColorScheme[] = ['dark', 'light'];

describe.each(SCHEMES)('%s palette', (scheme) => {
  const p = PALETTES[scheme];
  const backgrounds = { bg: p.bg, surface: p.surface, elevated: p.elevated };
  const textTokens = {
    text: p.text,
    muted: p.muted,
    accentText: p.accentText,
    amberText: p.amberText,
    coralText: p.coralText,
  };

  it.each(Object.entries(textTokens))('%s has ≥ 4.5:1 contrast on every background', (_n, fg) => {
    for (const bg of Object.values(backgrounds)) {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('text on an accent button has ≥ 4.5:1 contrast', () => {
    expect(contrastRatio(p.onAccent, p.accentFill)).toBeGreaterThanOrEqual(4.5);
  });

  it('never uses pure white or pure black', () => {
    const all = JSON.stringify(p).toUpperCase();
    expect(all).not.toContain('#FFFFFF');
    expect(all).not.toContain('#000000');
  });
});

it('uses the specified base colours', () => {
  expect(PALETTES.dark).toMatchObject({
    bg: '#16171A',
    surface: '#1F2125',
    elevated: '#282B30',
    text: '#E9E7E2',
    muted: '#9C9A94',
    accent: '#7BC6A4',
    amber: '#E3B169',
    coral: '#E08A7A',
  });
  expect(PALETTES.light).toMatchObject({
    bg: '#F5F3EE',
    surface: '#FCFBF8',
    text: '#24262A',
    muted: '#6B6A66',
    accent: '#3E8E6B',
    amber: '#B07C2A',
    coral: '#B85A4A',
  });
});
