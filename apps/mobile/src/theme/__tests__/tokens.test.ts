import { COLORS, contrastRatio } from '../tokens';

describe('palette', () => {
  const p = COLORS;
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

describe('brand & splash colours', () => {
  it('splash platinum off-white on the app background has ≥ 4.5:1 contrast', () => {
    expect(contrastRatio('#F8F9FA', COLORS.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('splash emerald on the app background has ≥ 4.5:1 contrast', () => {
    expect(contrastRatio('#10E896', COLORS.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('network banner text on the elevated surface has ≥ 4.5:1 contrast', () => {
    for (const fg of [COLORS.coralText, COLORS.amberText, COLORS.muted, COLORS.text]) {
      expect(contrastRatio(fg, COLORS.elevated)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

it('uses the PACE brand colours', () => {
  expect(COLORS).toMatchObject({
    bg: '#0B0F19',
    surface: '#111827',
    elevated: '#151E2D',
    secondaryBg: '#1C2738',
    border: '#273449',
    text: '#F8FAFC',
    muted: '#94A3B8',
    primary: '#2DD4BF',
    amber: '#FBBF24',
    coral: '#F87171',
  });
});

it('keeps no gold or forest green from the previous theme', () => {
  const all = JSON.stringify(COLORS).toUpperCase();
  for (const old of ['#D4AF37', '#081F17', '#12382B', '#154734', '#0D2A20', '#72C99B']) {
    expect(all).not.toContain(old);
  }
});
