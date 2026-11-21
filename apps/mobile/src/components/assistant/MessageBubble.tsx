import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { AssistantRole, AssistantStatus } from '@/data/assistantRepo';
import { formatTime } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, ICON, MIN_TOUCH, MOTION, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

import { AppText, type TextColor } from '../AppText';
import { Icon, type IconName } from '../Icon';
import { PressableScale } from '../PressableScale';

/** **bold** spans inside one line. */
function inline(line: string, color: TextColor): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <AppText key={i} color={color} style={styles.bold}>
        {part.slice(2, -2)}
      </AppText>
    ) : (
      part
    ),
  );
}

/**
 * The small subset of markdown the assistant is asked to use: paragraphs, "- " bullets, numbered
 * lines and **bold**. Headings are shown as bold lines; anything else is plain text.
 */
export function RichText({ text, color = 'text' }: { text: string; color?: TextColor }) {
  const blocks = text.replace(/\r\n/g, '\n').split('\n');
  return (
    <View style={styles.rich}>
      {blocks.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={styles.gap} />;
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={styles.bulletRow}>
              <AppText color={color} style={styles.bulletDot}>
                •
              </AppText>
              <AppText color={color} style={styles.flex}>
                {inline(bullet[1] ?? '', color)}
              </AppText>
            </View>
          );
        }
        const heading = line.match(/^#{1,6}\s+(.*)$/);
        if (heading) {
          return (
            <AppText key={i} color={color} style={styles.bold}>
              {(heading[1] ?? '').replace(/\*\*/g, '')}
            </AppText>
          );
        }
        return (
          <AppText key={i} color={color}>
            {inline(line, color)}
          </AppText>
        );
      })}
    </View>
  );
}

function BubbleAction({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={SPACE.sm}
      style={[styles.action, { borderColor: colors.border }]}
    >
      <Icon name={icon} size={ICON.sm} color="muted" />
      <AppText variant="caption" color="muted">
        {label}
      </AppText>
    </PressableScale>
  );
}

export interface MessageBubbleProps {
  role: AssistantRole;
  content: string;
  status: AssistantStatus;
  /** Still being written by the assistant. */
  streaming?: boolean;
  /** When it was sent (epoch ms), shown small under the text. */
  time?: number;
  onCopy?: () => void;
  onRetry?: () => void;
}

export const MessageBubble = memo(function MessageBubble({
  role,
  content,
  status,
  streaming = false,
  time,
  onCopy,
  onRetry,
}: MessageBubbleProps) {
  const { colors, reducedMotion } = useTheme();
  const entering = reducedMotion ? undefined : FadeInDown.duration(MOTION.fadeMs);

  if (role === 'user') {
    return (
      <Animated.View entering={entering} style={styles.userRow}>
        <View
          style={[styles.bubble, styles.userBubble, { backgroundColor: colors.primary }]}
          accessible
          accessibilityLabel={`You: ${content}`}
        >
          <AppText color="onAccent" style={styles.userText}>
            {content}
          </AppText>
          {time ? (
            <AppText variant="caption" color="onAccent" style={styles.time}>
              {formatTime(time)}
            </AppText>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  if (status === 'error') {
    return (
      <Animated.View entering={entering} style={styles.assistantRow}>
        <View
          style={[
            styles.bubble,
            styles.assistantBubble,
            {
              backgroundColor: withAlpha(colors.coral, 0.08),
              borderColor: withAlpha(colors.coral, 0.4),
            },
          ]}
          accessibilityRole="alert"
        >
          <View style={styles.errorHead}>
            <Icon name="alert-circle-outline" size={ICON.sm} color="coralText" />
            <AppText variant="label" color="coralText">
              Couldn&apos;t answer
            </AppText>
          </View>
          <AppText color="muted">{content}</AppText>
        </View>
        {onRetry ? (
          <View style={styles.actions}>
            <BubbleAction icon="refresh" label="Try again" onPress={onRetry} />
          </View>
        ) : null}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={entering} style={styles.assistantRow}>
      <View
        style={[
          styles.bubble,
          styles.assistantBubble,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        accessible
        accessibilityLabel={`Assistant: ${content}`}
        accessibilityLiveRegion={streaming ? 'polite' : 'none'}
      >
        <View style={styles.assistantInner}>
          <View style={[styles.avatar, { backgroundColor: withAlpha(colors.primary, 0.16) }]}>
            <Icon name="sparkles" size={14} tint={colors.primary} />
          </View>
          <View style={styles.flex}>
            <RichText text={content} />
          </View>
        </View>
        {time && !streaming ? (
          <AppText variant="caption" color="muted" style={styles.time}>
            {formatTime(time)}
          </AppText>
        ) : null}
      </View>
      {!streaming && onCopy ? (
        <View style={styles.actions}>
          <BubbleAction icon="copy-outline" label="Copy" onPress={onCopy} />
        </View>
      ) : null}
    </Animated.View>
  );
});

/** Shown until the first words arrive. Static on purpose: the app has no looping animations. */
export function ThinkingBubble() {
  const { colors } = useTheme();
  return (
    <View style={styles.assistantRow} accessibilityLiveRegion="polite">
      <View
        style={[
          styles.bubble,
          styles.thinking,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        accessible
        accessibilityLabel="The assistant is looking at your numbers"
      >
        <View style={styles.dots}>
          {[0.9, 0.6, 0.35].map((o) => (
            <View key={o} style={[styles.dot, { backgroundColor: colors.accent, opacity: o }]} />
          ))}
        </View>
        <AppText variant="caption" color="muted">
          Looking at your numbers…
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rich: { gap: SPACE.xs },
  gap: { height: SPACE.xs },
  bold: { fontFamily: FONT.semibold },
  bulletRow: { flexDirection: 'row', gap: SPACE.sm, paddingLeft: SPACE.xs },
  bulletDot: { lineHeight: 24 },
  userRow: { alignItems: 'flex-end' },
  assistantRow: { alignItems: 'flex-start', gap: SPACE.xs },
  bubble: { borderRadius: RADIUS.lg, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  userBubble: { maxWidth: '82%', borderBottomRightRadius: RADIUS.sm / 2, gap: SPACE.xs },
  userText: { fontFamily: FONT.medium },
  time: { alignSelf: 'flex-end', fontSize: 11, lineHeight: 14, opacity: 0.8 },
  assistantInner: { flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' },
  assistantBubble: {
    maxWidth: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: RADIUS.sm / 2,
    gap: SPACE.xs,
  },
  assistantHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  actions: { flexDirection: 'row', gap: SPACE.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    minHeight: MIN_TOUCH - SPACE.md,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: RADIUS.sm / 2,
  },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
