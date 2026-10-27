import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import geminiSvg from '../../../assets/gemini-svg.svg';

import { useTheme } from '@/theme/ThemeProvider';
import { RADIUS } from '@/theme/tokens';

/*
 * Plays assets/gemini-svg.svg exactly as designed.
 *
 * The logo's animation lives in the SVG's own CSS (@keyframes slideP / emergeA / emergeC /
 * emergeE). React Native's SVG renderers ignore CSS animation, so the untouched file is shown in
 * a WebView, the same engine that animates it in a browser. Nothing is re-created or copied:
 * the bundled asset itself is read and rendered.
 */

const SVG_BACKGROUND = '#0B0D11'; // the SVG's .bg-rect, so there is no flash while it loads
const CYCLE_MS = 4200; // the SVG's animation duration
const FORMED_AT = 0.52; // emergeE finishes at 52%: the full word "PACE" is on screen
/** With Reduce Motion: freeze on the fully formed frame (inside the 52%–85% hold). */
const REDUCED_MOTION_CSS = `<style>
  .p-icon, .char-a, .char-c, .char-e {
    animation-delay: -${(CYCLE_MS * 0.65) / 1000}s !important;
    animation-play-state: paused !important;
  }
</style>`;

let svgMarkup: Promise<string> | null = null;

/** Reads the bundled SVG file once (works in dev from Metro and in release from the APK). */
function loadSvgMarkup(): Promise<string> {
  if (!svgMarkup) {
    svgMarkup = (async () => {
      const asset = Asset.fromModule(geminiSvg);
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error('logo asset unavailable');
      return new File(asset.localUri).text();
    })().catch((error: unknown) => {
      svgMarkup = null;
      throw error;
    });
  }
  return svgMarkup;
}

function toHtml(svg: string, reducedMotion: boolean): string {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: ${SVG_BACKGROUND}; }
  svg { display: block; width: 100%; height: 100%; }
</style>
${reducedMotion ? REDUCED_MOTION_CSS : ''}
</head><body>${svg}</body></html>`;
}

interface PaceLogoProps {
  width: number;
  /** Mount (and so start) the animation only when it can be seen, e.g. after the splash. */
  play?: boolean;
  /** When true, renders already fully formed without re-playing entrance animation. */
  staticFormed?: boolean;
  /** Called once the word "PACE" is fully formed. */
  onIntroEnd?: () => void;
}

export function PaceLogo({ width, play = true, staticFormed = false, onIntroEnd }: PaceLogoProps) {
  const { reducedMotion } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const height = width / 2; // viewBox 1000 × 500

  useEffect(() => {
    let active = true;
    loadSvgMarkup()
      .then((markup) => active && setSvg(markup))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  const isStatic = reducedMotion || staticFormed;

  // Tell the screen when the word has formed, timed from when the SVG actually started.
  useEffect(() => {
    if (failed || (loaded && isStatic)) {
      onIntroEnd?.();
      return;
    }
    if (!loaded) return;
    const timer = setTimeout(() => onIntroEnd?.(), CYCLE_MS * FORMED_AT);
    return () => clearTimeout(timer);
  }, [loaded, failed, isStatic, onIntroEnd]);

  return (
    <View
      style={[styles.frame, { width, height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Paisa Pulse"
    >
      {play && svg ? (
        <WebView
          source={{ html: toHtml(svg, isStatic) }}
          originWhitelist={['*']}
          onLoadEnd={() => setLoaded(true)}
          javaScriptEnabled={false}
          scrollEnabled={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          setSupportMultipleWindows={false}
          androidLayerType="hardware"
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          style={styles.web}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    backgroundColor: SVG_BACKGROUND,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  web: { flex: 1, backgroundColor: SVG_BACKGROUND },
});
