import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { SPACE } from '@/theme/tokens';

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

/** Page container: theme background, safe areas, generous padding, optional sticky footer. */
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
  return (
    <SafeAreaView
      edges={inScroll ? edges.filter((e) => e !== 'top') : edges}
      style={[styles.root, { backgroundColor: colors.bg }]}
    >
      {inScroll ? null : background}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            padding,
            styles.scrollContent,
            inScroll && edges.includes('top')
              ? { paddingTop: insets.top + (padded ? SPACE.lg : 0) }
              : null,
          ]}
          keyboardShouldPersistTaps="handled"
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { paddingTop: SPACE.lg },
  scrollContent: { paddingBottom: SPACE.xxxl, gap: SPACE.lg },
  footer: { paddingVertical: SPACE.md },
});
