import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { SPACE } from '@/theme/tokens';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  footer?: ReactNode;
  refreshControl?: ScrollViewProps['refreshControl'];
  padded?: boolean;
}

/** Page container: theme background, safe areas, generous padding, optional sticky footer. */
export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  footer,
  refreshControl,
  padded = true,
}: ScreenProps) {
  const { colors } = useTheme();
  const padding = padded ? styles.padded : undefined;
  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: colors.bg }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[padding, styles.scrollContent]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, padding]}>{children}</View>
      )}
      {footer ? (
        <View style={[styles.footer, { borderTopColor: colors.border }]}>{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg },
  scrollContent: { paddingBottom: SPACE.xxxl, gap: SPACE.lg },
  footer: {
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
