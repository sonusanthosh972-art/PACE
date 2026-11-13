import { useRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { SPACE } from '@/theme/tokens';

import { KeyboardRevealContext, useKeyboardInset } from './useKeyboardInset';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  footer?: ReactNode;
  refreshControl?: ScrollViewProps['refreshControl'];
  padded?: boolean;
  background?: ReactNode;
  /** Side padding; defaults to SPACE.xl. */
  gutter?: number;
  /** Hairline above the sticky footer (off when the footer floats over the content). */
  footerDivider?: boolean;
  /**
   * The background scrolls away with the content and reaches up under the status bar, instead of
   * staying fixed behind it.
   */
  backgroundScrolls?: boolean;
}

/**
 * Page container: theme background, safe areas, generous padding, optional sticky footer. Scrolling
 * pages stay scrollable with the keyboard open, and a focused field is moved above the keyboard.
 */
export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  footer,
  refreshControl,
  padded = true,
  background,
  gutter = SPACE.xl,
  footerDivider = true,
  backgroundScrolls = false,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const padding = padded ? [styles.padded, { paddingHorizontal: gutter }] : undefined;
  const inScroll = scroll && backgroundScrolls;
  const rootRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const keyboard = useKeyboardInset(rootRef, scrollRef);
  return (
    <KeyboardRevealContext.Provider value={scroll ? keyboard.reveal : null}>
      <SafeAreaView
        ref={rootRef}
        edges={inScroll ? edges.filter((e) => e !== 'top') : edges}
        style={[styles.root, { backgroundColor: colors.bg }]}
      >
        {inScroll ? null : background}
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[
              padding,
              styles.scrollContent,
              inScroll && edges.includes('top')
                ? { paddingTop: insets.top + (padded ? SPACE.lg : 0) }
                : null,
              // Extra room under the content while the keyboard covers the bottom of the screen.
              keyboard.inset > 0 ? { paddingBottom: SPACE.xxxl + keyboard.inset } : null,
            ]}
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => keyboard.onScroll(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={32}
            refreshControl={refreshControl}
          >
            {inScroll ? background : null}
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.root, padding]}>{children}</View>
        )}
        {footer ? (
          <View
            style={[
              styles.footer,
              { paddingHorizontal: gutter },
              footerDivider
                ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                : null,
            ]}
          >
            {footer}
          </View>
        ) : null}
      </SafeAreaView>
    </KeyboardRevealContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { paddingTop: SPACE.lg },
  scrollContent: { paddingBottom: SPACE.xxxl, gap: SPACE.lg },
  footer: { paddingVertical: SPACE.md },
});
