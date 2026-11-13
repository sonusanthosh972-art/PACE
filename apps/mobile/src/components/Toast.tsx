import { StyleSheet, View, Pressable } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { useToastStore, type Toast, type ToastType } from '@/state/toastStore';
import { MOTION, RADIUS, SPACE } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

const TOAST_COLORS: Record<ToastType, { bg: string; icon: IconName }> = {
  success: { bg: '#10B981', icon: 'checkmark-circle-outline' },
  error: { bg: '#EF4444', icon: 'alert-circle-outline' },
  info: { bg: '#3B82F6', icon: 'information-circle-outline' },
  warning: { bg: '#F59E0B', icon: 'alert-circle-outline' },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const toastColor = TOAST_COLORS[toast.type];

  return (
    <Animated.View
      entering={SlideInDown.duration(MOTION.fadeMs)}
      exiting={SlideOutDown.duration(MOTION.fadeMs)}
      style={styles.toastWrapper}
    >
      <Pressable
        style={[styles.toast, { backgroundColor: toastColor.bg }]}
        onPress={toast.action?.onPress}
      >
        <View style={styles.content}>
          <Icon name={toastColor.icon} size={20} tint="white" />
          <AppText style={styles.message} color="text">
            {toast.message}
          </AppText>
        </View>

        {toast.action ? (
          <AppText style={styles.action} color="text">
            {toast.action.label}
          </AppText>
        ) : (
          <Pressable onPress={onDismiss} hitSlop={8}>
            <Icon name="close" size={20} tint="#FFFFFF" />
          </Pressable>
        )}
      </Pressable>
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
    pointerEvents: 'box-none',
  },
  toastWrapper: {
    pointerEvents: 'auto',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.md,
    minHeight: 48,
    gap: SPACE.md,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  action: {
    fontWeight: '600',
    fontSize: 13,
  },
});
