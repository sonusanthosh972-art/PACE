/**
 * The Money Assistant on the phone: asks the PACE API (which holds the OpenRouter key and builds
 * the user's financial context) and streams the answer back. Read-only: nothing here changes data.
 */
import { z } from 'zod';

import type { AssistantMessage } from '@/data/assistantRepo';

import { apiClient, apiStream } from './api/client';
import { syncNow } from './sync';

/** Messages sent per question; the server keeps the last 8 of these. */
const HISTORY_SENT = 12;
/** How long to wait for the pre-question sync before asking anyway. */
const SYNC_WAIT_MS = 8_000;
export const MAX_QUESTION_CHARS = 1_500;
/** The server is older than the app (the assistant endpoint is not deployed there yet). */
export const NOT_ON_SERVER = "The Money Assistant isn't available on the PACE server yet.";

export class AssistantError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AssistantError';
  }
}

const statusSchema = z.object({
  enabled: z.boolean(),
  dailyMessageLimit: z.number(),
  usedToday: z.number(),
  remainingToday: z.number(),
  maxMessageChars: z.number(),
});
export type AssistantStatus = z.infer<typeof statusSchema>;

export function fetchAssistantStatus(): Promise<AssistantStatus> {
  return apiClient('/api/v1/assistant/status', {}, statusSchema);
}

/**
 * Sends recent payments first so the answer uses today's numbers. Never blocks the question for
 * long: a slow or failed sync just means the server's last copy is used.
 */
export async function syncBeforeAsking(): Promise<void> {
  await Promise.race([
    syncNow().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, SYNC_WAIT_MS)),
  ]);
}

/** The conversation as the server expects it: finished turns only, ending with the question. */
export function historyForRequest(
  messages: readonly Pick<AssistantMessage, 'role' | 'content' | 'status'>[],
): { role: 'user' | 'assistant'; content: string }[] {
  const turns = messages
    .filter((m) => m.status === 'done' && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_QUESTION_CHARS) }));
  // Drop trailing assistant turns so the last message is the user's question.
  while (turns.length > 0 && turns[turns.length - 1]?.role !== 'user') turns.pop();
  return turns.slice(-HISTORY_SENT);
}

/**
 * How many leading bytes form whole UTF-8 characters. A character such as "₹" (3 bytes) can be
 * split across network chunks; the unfinished tail waits for the next chunk.
 */
export function completeUtf8Length(bytes: Uint8Array): number {
  const n = bytes.length;
  for (let back = 1; back <= Math.min(3, n); back++) {
    const b = bytes[n - back] ?? 0;
    if ((b & 0xc0) === 0x80) continue; // continuation byte: keep looking for the lead byte
    const size = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
    return size > back ? n - back : n;
  }
  return n;
}

interface SseEvent {
  event: string;
  data: string;
}

/** Splits a server-sent-events buffer into complete events; returns the unfinished remainder. */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length > 0) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}

/**
 * Asks the assistant and calls `onText` with the answer so far as it streams in.
 * Resolves with the full answer; throws AssistantError with a message fit to show.
 */
export async function streamAssistantReply(args: {
  history: { role: 'user' | 'assistant'; content: string }[];
  signal: AbortSignal;
  onText: (textSoFar: string) => void;
}): Promise<string> {
  let response: Response;
  try {
    response = await apiStream('/api/v1/assistant/chat', { messages: args.history }, args.signal);
  } catch (err) {
    if (args.signal.aborted) throw err;
    const e = err as { message?: string; statusCode?: number; isNetworkError?: boolean };
    const status = e.statusCode ?? 0;
    if (status === 404) throw new AssistantError(NOT_ON_SERVER, false);
    throw new AssistantError(
      e.message ?? 'Something went wrong. Please try again.',
      e.isNetworkError === true ||
        status === 409 ||
        status === 502 ||
        status === 504 ||
        status === 503,
    );
  }

  if (!response.body)
    throw new AssistantError('The answer could not be read. Please try again.', true);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = new Uint8Array(0);
  let buffer = '';
  let text = '';
  let finished = false;
  try {
    while (!finished) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (args.signal.aborted) throw err;
        throw new AssistantError('The connection dropped. Please try again.', true);
      }
      if (chunk.done) break;
      const joined = new Uint8Array(pending.length + chunk.value.length);
      joined.set(pending);
      joined.set(chunk.value, pending.length);
      const cut = completeUtf8Length(joined);
      buffer += decoder.decode(joined.subarray(0, cut));
      pending = joined.slice(cut);
      const parsed = parseSse(buffer);
      buffer = parsed.rest;
      for (const ev of parsed.events) {
        let data: { text?: string; message?: string; retryable?: boolean };
        try {
          data = JSON.parse(ev.data);
        } catch {
          continue;
        }
        if (ev.event === 'delta' && data.text) {
          text += data.text;
          args.onText(text);
        } else if (ev.event === 'error') {
          throw new AssistantError(
            data.message ?? 'The assistant had a problem. Please try again.',
            data.retryable !== false,
          );
        } else if (ev.event === 'done') {
          finished = true;
        }
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }

  if (!text.trim()) throw new AssistantError('No answer came back. Please try again.', true);
  return text;
}
