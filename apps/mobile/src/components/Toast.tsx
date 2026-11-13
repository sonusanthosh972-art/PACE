import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { useToastStore, type Toast, type ToastType } from '@/state/toastStore';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, MOTION, RADIUS, SPACE } from '@/theme/tokens';

import { AppText, type TextColor } from './AppText';
import { Icon, type IconName } from './Icon';

/** Theme text colours only, so every message keeps the palette's tested contrast. */
const TOAST_STYLE: Record<ToastType, { tone: TextColor; icon: IconName }> = {
  success: { tone: 'accentText', icon: 'checkmark-circle-outline' },
  error: { tone: 'coralText', icon: 'alert-circle-outline' },
  info: { tone: 'text', icon: 'information-circle-outline' },
  warning: { tone: 'amberText', icon: 'alert-circle-outline' },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { colors } = useTheme();
  const { tone, icon } = TOAST_STYLE[toast.type];
  const toneColor = colors[tone];

  return (
    <Animated.View
      entering={SlideInDown.duration(MOTION.fadeMs)}
      exiting={SlideOutDown.duration(MOTION.fadeMs)}
      style={[styles.toast, { backgroundColor: colors.elevated, borderColor: toneColor }]}
      accessibilityRole="alert"
      accessibilityLiveRegion={toast.type === 'error' ? 'assertive' : 'polite'}
    >
      <View style={styles.content}>
        <Icon name={icon} size={20} tint={toneColor} />
        <AppText variant="caption" color="text" style={styles.message}>
          {toast.message}
        </AppText>
      </View>

      {toast.action ? (
        <Pressable
          onPress={toast.action.onPress}
          accessibilityRole="button"
          accessibilityLabel={toast.action.label}
          style={styles.button}
        >
          <AppText variant="label" color={tone}>
            {toast.action.label}
          </AppText>
        </Pressable>
      ) : (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={styles.button}
        >
          <Icon name="close" size={20} color="muted" />
        </Pressable>
      )}
    </Animated.View>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACE.lg,
    gap: SPACE.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SPACE.lg,
    paddingRight: SPACE.xs,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TOUCH,
    gap: SPACE.sm,
  },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  message: { flex: 1, paddingVertical: SPACE.md },
  button: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    paddingHorizontal: SPACE.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
