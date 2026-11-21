import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  ScrollView,
  Platform,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { MessageBubble, ThinkingBubble } from '@/components/assistant/MessageBubble';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { PressableScale } from '@/components/PressableScale';
import { getAppDb } from '@/data/appDb';
import {
  clearAssistantMessages,
  deleteAssistantMessage,
  listAssistantMessages,
  saveAssistantMessage,
  type AssistantMessage,
} from '@/data/assistantRepo';
import {
  AssistantError,
  fetchAssistantStatus,
  historyForRequest,
  MAX_QUESTION_CHARS,
  NOT_ON_SERVER,
  streamAssistantReply,
  syncBeforeAsking,
} from '@/services/assistant';
import { useAuthStore } from '@/state/authStore';
import { useSettings } from '@/state/queries';
import { useToastStore } from '@/state/toastStore';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, ICON, MIN_TOUCH, RADIUS, SPACE, withAlpha } from '@/theme/tokens';

export const QUICK_PROMPTS: { icon: IconName; label: string; question: string }[] = [
  {
    icon: 'pie-chart-outline',
    label: 'Analyse my spending',
    question: 'Analyse my spending this cycle.',
  },
  {
    icon: 'bag-handle-outline',
    label: 'Can I afford this?',
    question: 'Can I afford to buy something for ₹5,000?',
  },
  { icon: 'leaf-outline', label: 'Help me save money', question: 'Help me create a savings plan.' },
  { icon: 'pulse-outline', label: 'How am I doing?', question: 'How am I doing this month?' },
];

/** Short follow-ups offered above the composer once a conversation has started. */
const FOLLOW_UPS = ['How can I save more?', 'Analyse my spending', 'How am I doing this month?'];

export const SUGGESTED_QUESTIONS = [
  'How much should I spend today?',
  'Where am I spending too much?',
  'Compare this month with last month.',
  'How much money will I have by payday?',
  'Why am I running out of money before payday?',
];

/** How close to the bottom (px) still counts as "following" the answer. */
const FOLLOW_THRESHOLD = 96;
/** Streamed text is drawn at most this often, so long answers don't re-render every word. */
const STREAM_FLUSH_MS = 50;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type Item =
  | { kind: 'message'; message: AssistantMessage }
  | { kind: 'streaming'; text: string }
  | { kind: 'thinking' };

export default function AssistantScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const demoMode = Boolean(useSettings().data?.demoMode);
  const canAsk = signedIn && !demoMode;
  const status = useQuery({
    queryKey: ['assistant', 'status'],
    queryFn: fetchAssistantStatus,
    enabled: canAsk,
    staleTime: 60_000,
    // A missing endpoint (older server) will not appear on a retry.
    retry: (count, err) => (err as { statusCode?: number }).statusCode !== 404 && count < 1,
  });

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const listRef = useRef<FlatList<Item>>(null);
  const rootRef = useRef<View>(null);
  const following = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    getAppDb()
      .then(listAssistantMessages)
      .then((rows) => {
        if (mounted.current) setMessages(rows);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted.current) setLoaded(true);
      });
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Android draws edge-to-edge and no longer shrinks the window for the keyboard: measure how
  // much of this screen the keyboard covers (zero where the system did shrink it).
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      rootRef.current?.measureInWindow((_x, y, _w, h) => {
        setKeyboardInset(Math.max(0, y + h - e.endCoordinates.screenY - insets.bottom));
        if (following.current)
          requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      });
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [insets.bottom]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    following.current =
      contentSize.height - (contentOffset.y + layoutMeasurement.height) < FOLLOW_THRESHOLD;
  }, []);

  /** Only follows new text while the reader is at the bottom; never drags them back down. */
  const onContentSizeChange = useCallback(() => {
    if (following.current) listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const persist = useCallback(async (message: AssistantMessage) => {
    try {
      await saveAssistantMessage(await getAppDb(), message);
    } catch {
      // The chat still works this session even if saving fails.
    }
  }, []);

  /** Streams an answer for the conversation ending in the latest user message. */
  const answer = useCallback(
    async (conversation: AssistantMessage[]) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setStreamText('');
      following.current = true;
      const controller = new AbortController();
      abortRef.current = controller;

      let latest = '';
      let timer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        timer = null;
        if (mounted.current) setStreamText(latest);
      };

      let reply: AssistantMessage | null = null;
      try {
        await syncBeforeAsking();
        const text = await streamAssistantReply({
          history: historyForRequest(conversation),
          signal: controller.signal,
          onText: (soFar) => {
            latest = soFar;
            if (!timer) timer = setTimeout(flush, STREAM_FLUSH_MS);
          },
        });
        reply = {
          id: newId(),
          role: 'assistant',
          content: text,
          status: 'done',
          createdAt: Date.now(),
        };
      } catch (err) {
        if (controller.signal.aborted) {
          // Stopped by the user (or the screen closed): keep what had arrived, if anything.
          if (latest.trim()) {
            reply = {
              id: newId(),
              role: 'assistant',
              content: latest,
              status: 'done',
              createdAt: Date.now(),
            };
          }
        } else {
          const message =
            err instanceof AssistantError ? err.message : 'Something went wrong. Please try again.';
          reply = {
            id: newId(),
            role: 'assistant',
            content: message,
            status: 'error',
            createdAt: Date.now(),
          };
        }
      } finally {
        if (timer) clearTimeout(timer);
        abortRef.current = null;
        busyRef.current = false;
      }

      if (reply) {
        await persist(reply);
        if (mounted.current) setMessages((prev) => [...prev, reply]);
      }
      if (mounted.current) {
        setStreamText(null);
        setBusy(false);
        status.refetch().catch(() => undefined);
      }
    },
    [persist, status],
  );

  const send = useCallback(
    async (text: string) => {
      const question = text.trim().slice(0, MAX_QUESTION_CHARS);
      if (!question || busyRef.current || !canAsk) return;
      Haptics.selectionAsync().catch(() => undefined);
      const userMessage: AssistantMessage = {
        id: newId(),
        role: 'user',
        content: question,
        status: 'done',
        createdAt: Date.now(),
      };
      const conversation = [...messages, userMessage];
      setMessages(conversation);
      setDraft('');
      await persist(userMessage);
      await answer(conversation);
    },
    [answer, canAsk, messages, persist],
  );

  const retry = useCallback(
    async (failed: AssistantMessage) => {
      if (busyRef.current) return;
      const conversation = messages.filter((m) => m.id !== failed.id);
      setMessages(conversation);
      try {
        await deleteAssistantMessage(await getAppDb(), failed.id);
      } catch {
        // Not saved; nothing to remove.
      }
      await answer(conversation);
    },
    [answer, messages],
  );

  const copy = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text.replace(/\*\*/g, ''));
    Haptics.selectionAsync().catch(() => undefined);
    useToastStore.getState().show('Copied', 'success', 1500);
  }, []);

  const clear = useCallback(() => {
    Alert.alert('Clear conversation?', 'This removes the chat from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          abortRef.current?.abort();
          try {
            await clearAssistantMessages(await getAppDb());
          } catch {
            // Already empty or not saved.
          }
          setMessages([]);
        },
      },
    ]);
  }, []);

  const items: Item[] = messages.map((message) => ({ kind: 'message', message }));
  if (streamText !== null) {
    items.push(streamText ? { kind: 'streaming', text: streamText } : { kind: 'thinking' });
  }
  const lastMessage = messages[messages.length - 1];

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === 'thinking') return <ThinkingBubble />;
    if (item.kind === 'streaming') {
      return <MessageBubble role="assistant" content={item.text} status="done" streaming />;
    }
    const m = item.message;
    return (
      <MessageBubble
        role={m.role}
        content={m.content}
        status={m.status}
        time={m.createdAt}
        onCopy={m.role === 'assistant' && m.status === 'done' ? () => copy(m.content) : undefined}
        onRetry={
          m.status === 'error' && m.id === lastMessage?.id && !busy ? () => retry(m) : undefined
        }
      />
    );
  };

  const notOnServer = (status.error as { statusCode?: number } | null)?.statusCode === 404;
  const disabled =
    notOnServer || status.data?.enabled === false || status.data?.remainingToday === 0;
  const empty = loaded && messages.length === 0 && streamText === null;

  return (
    <SafeAreaView
      ref={rootRef}
      edges={['top', 'bottom']}
      style={[styles.root, { backgroundColor: colors.bg }]}
    >
      <View style={styles.header}>
        <PressableScale
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="arrow-back" size={ICON.lg} color="text" />
        </PressableScale>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <AppText variant="heading" accessibilityRole="header" style={styles.title}>
              Money Assistant
            </AppText>
            <Icon name="sparkles" size={ICON.md} tint={colors.primary} />
          </View>
          <AppText variant="caption" color="muted">
            Your personal finance companion
          </AppText>
        </View>
        {messages.length > 0 ? (
          <PressableScale
            onPress={clear}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Clear conversation"
          >
            <Icon name="trash-outline" size={ICON.md} color="muted" />
          </PressableScale>
        ) : null}
      </View>

      {!canAsk ? (
        <Gate demoMode={demoMode} />
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item, i) =>
              item.kind === 'message' ? item.message.id : `${item.kind}-${i}`
            }
            renderItem={renderItem}
            contentContainerStyle={[styles.list, empty && styles.listEmpty]}
            ListEmptyComponent={
              empty ? <EmptyChat onPick={send} disabled={disabled || busy} /> : null
            }
            onScroll={onScroll}
            scrollEventThrottle={32}
            onContentSizeChange={onContentSizeChange}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          />

          {notOnServer ? (
            <Notice text={NOT_ON_SERVER} />
          ) : status.data && !status.data.enabled ? (
            <Notice text="The assistant isn't switched on for this server yet." />
          ) : status.data && status.data.remainingToday === 0 ? (
            <Notice text="You've used today's questions. The assistant is back tomorrow." />
          ) : null}

          {messages.length > 0 && !busy && !disabled ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.followUps}
              style={styles.followUpsScroll}
            >
              {FOLLOW_UPS.map((q) => (
                <PressableScale
                  key={q}
                  onPress={() => send(q)}
                  accessibilityRole="button"
                  accessibilityLabel={q}
                  style={[
                    styles.followUp,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <AppText variant="caption">{q}</AppText>
                </PressableScale>
              ))}
            </ScrollView>
          ) : null}

          <View style={[styles.composer, { paddingBottom: SPACE.md + keyboardInset }]}>
            <View
              style={[
                styles.inputWrap,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Icon name="sparkles-outline" size={ICON.md} tint={colors.primary} />
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask a question…"
                placeholderTextColor={colors.muted}
                multiline
                maxLength={MAX_QUESTION_CHARS}
                editable={!disabled}
                accessibilityLabel="Your question"
                style={[styles.input, { color: colors.text }]}
              />
              {busy ? (
                <PressableScale
                  onPress={() => abortRef.current?.abort()}
                  style={[styles.send, { backgroundColor: colors.elevated }]}
                  accessibilityRole="button"
                  accessibilityLabel="Stop the answer"
                >
                  <Icon name="stop" size={ICON.sm} color="text" />
                </PressableScale>
              ) : (
                <PressableScale
                  onPress={() => send(draft)}
                  disabled={!draft.trim() || disabled}
                  style={[
                    styles.send,
                    {
                      backgroundColor: draft.trim() && !disabled ? colors.primary : colors.elevated,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                  accessibilityState={{ disabled: !draft.trim() || disabled }}
                >
                  <Icon
                    name="chevron-forward"
                    size={ICON.md}
                    tint={draft.trim() && !disabled ? colors.onAccent : colors.muted}
                  />
                </PressableScale>
              )}
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Notice({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.notice, { backgroundColor: withAlpha(colors.amber, 0.1) }]}
      accessibilityRole="alert"
    >
      <Icon name="information-circle-outline" size={ICON.sm} color="amberText" />
      <AppText variant="caption" color="amberText" style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

function EmptyChat({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={styles.hero}>
        <View style={[styles.halo, { backgroundColor: withAlpha(colors.accent, 0.08) }]}>
          <View style={[styles.disc, { backgroundColor: withAlpha(colors.accent, 0.16) }]}>
            <Icon name="sparkles" size={30} tint={colors.accent} />
          </View>
        </View>
        <AppText variant="serifTitle" center style={styles.heroTitle}>
          Ask about your money
        </AppText>
        <AppText color="muted" center>
          Answers use your salary, bills, savings and payments, worked out by PACE. It can explain
          and suggest; it never changes anything.
        </AppText>
      </View>

      <View style={styles.quickGrid}>
        {QUICK_PROMPTS.map((p) => (
          <PressableScale
            key={p.label}
            onPress={() => onPick(p.question)}
            disabled={disabled}
            style={[
              styles.quick,
              { backgroundColor: colors.surface, borderColor: colors.border },
              disabled && styles.dimmed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={p.label}
          >
            <Icon name={p.icon} size={ICON.md} tint={colors.accent} />
            <AppText variant="label">{p.label}</AppText>
          </PressableScale>
        ))}
      </View>

      <View style={styles.suggestions}>
        <AppText variant="overline" color="muted">
          Or try
        </AppText>
        {SUGGESTED_QUESTIONS.map((q) => (
          <PressableScale
            key={q}
            onPress={() => onPick(q)}
            disabled={disabled}
            style={[styles.suggestion, { borderColor: colors.border }, disabled && styles.dimmed]}
            accessibilityRole="button"
            accessibilityLabel={q}
          >
            <AppText color="muted" style={styles.flex}>
              {q}
            </AppText>
            <Icon name="arrow-forward" size={ICON.sm} color="muted" />
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

function Gate({ demoMode }: { demoMode: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.gate}>
      <View style={[styles.disc, { backgroundColor: withAlpha(colors.accent, 0.16) }]}>
        <Icon
          name={demoMode ? 'flask-outline' : 'person-circle-outline'}
          size={30}
          tint={colors.accent}
        />
      </View>
      <AppText variant="heading" center>
        {demoMode ? 'Not available with sample data' : 'Sign in to use the assistant'}
      </AppText>
      <AppText color="muted" center>
        {demoMode
          ? 'The assistant answers from your real numbers. Switch to your own data to use it.'
          : 'The assistant reads your budget from your PACE account backup, so it needs you to be signed in. Your chat stays on this phone.'}
      </AppText>
      {demoMode ? (
        <Button label="Use my real data" onPress={() => router.push('/settings/exit-sample')} />
      ) : (
        <Button
          label="Sign in"
          icon="log-in-outline"
          onPress={() => router.push('/settings/auth?mode=login')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
  },
  headerText: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  title: { fontSize: 22, lineHeight: 30 },
  iconButton: {
    width: MIN_TOUCH - 4,
    height: MIN_TOUCH - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followUpsScroll: { flexGrow: 0 },
  followUps: { gap: SPACE.sm, paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.sm },
  followUp: {
    minHeight: 40,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: SPACE.gutter,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.lg,
    gap: SPACE.lg,
  },
  listEmpty: { flexGrow: 1 },
  empty: { gap: SPACE.xl, paddingTop: SPACE.lg },
  hero: { alignItems: 'center', gap: SPACE.sm },
  heroTitle: { fontSize: 26, lineHeight: 34, marginTop: SPACE.sm },
  halo: {
    width: 104,
    height: 104,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: 68,
    height: 68,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  quick: {
    flexBasis: '48%',
    flexGrow: 1,
    gap: SPACE.sm,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 88,
    justifyContent: 'space-between',
  },
  suggestions: { gap: SPACE.sm },
  dimmed: { opacity: 0.45 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    minHeight: MIN_TOUCH,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginHorizontal: SPACE.lg,
    marginBottom: SPACE.sm,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
  },
  composer: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xs },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.sm,
    minHeight: 56,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: SPACE.lg,
    paddingRight: SPACE.xs + 2,
    paddingVertical: SPACE.xs + 2,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingVertical: SPACE.md - 2,
    fontFamily: FONT.regular,
    fontSize: 16,
    lineHeight: 22,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.xl,
  },
});
