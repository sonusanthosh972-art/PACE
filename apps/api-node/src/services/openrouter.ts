/**
 * OpenRouter chat completions client (https://openrouter.ai/api/v1/chat/completions).
 * Streams the answer as server-sent events. The API key is read from the environment on the
 * server only and is never logged or returned.
 */

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Affordable default (GLM 5.3 Flash: $0.15 in / $0.50 out per million tokens); override with OPENROUTER_MODEL without touching the app. */
export const DEFAULT_MODEL = 'z-ai/glm-5.3-flash';

export interface AssistantConfig {
  apiKey: string | null;
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  perMinuteLimit: number;
}

function intEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!value || !Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Read at request time, so a key added on the host takes effect without code changes. */
export function loadAssistantConfig(env: NodeJS.ProcessEnv = process.env): AssistantConfig {
  return {
    apiKey: env.OPENROUTER_API_KEY?.trim() || null,
    model: env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
    maxOutputTokens: intEnv(env.AI_MAX_OUTPUT_TOKENS, 700, 64, 4000),
    timeoutMs: intEnv(env.AI_TIMEOUT_MS, 45_000, 5_000, 120_000),
    dailyMessageLimit: intEnv(env.AI_DAILY_MESSAGE_LIMIT, 40, 1, 10_000),
    dailyTokenLimit: intEnv(env.AI_DAILY_TOKEN_LIMIT, 150_000, 1_000, 10_000_000),
    perMinuteLimit: intEnv(env.AI_PER_MINUTE_LIMIT, 8, 1, 600),
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; finishReason: string | null; promptTokens: number; completionTokens: number };

/** A failure talking to OpenRouter, mapped to what the phone should show. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
let fetchOverride: FetchLike | null = null;

/** Tests replace the network with this. Pass null to restore fetch. */
export function setOpenRouterFetch(fn: FetchLike | null): void {
  fetchOverride = fn;
}

/** Friendly, non-leaking message for an OpenRouter status code. */
export function upstreamErrorFor(status: number): UpstreamError {
  switch (status) {
    case 401:
    case 403:
      return new UpstreamError('The assistant is not available right now.', 503, false);
    case 402:
      return new UpstreamError('The assistant has reached its usage limit. Please try again later.', 503, false);
    case 408:
    case 524:
      return new UpstreamError('The assistant took too long to answer. Please try again.', 504, true);
    case 429:
      return new UpstreamError('The assistant is busy right now. Please try again in a minute.', 503, true);
    case 400:
    case 413:
    case 422:
      return new UpstreamError('The assistant could not read that question. Try asking it differently.', 502, false);
    default:
      return new UpstreamError('The assistant is having trouble right now. Please try again.', 502, true);
  }
}

/**
 * Sends the conversation and yields text as it arrives, then one `done` with token usage.
 * Throws UpstreamError for provider failures (before or during the stream) and on timeout.
 */
export async function* streamChat(args: {
  config: AssistantConfig;
  messages: ChatMessage[];
  /** Pseudonymous id for the provider's abuse isolation (never the email). */
  user: string;
  signal: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const { config } = args;
  if (!config.apiKey) throw new UpstreamError('The assistant is not configured on this server.', 503, false);

  const timeout = AbortSignal.timeout(config.timeoutMs);
  const signal = AbortSignal.any([args.signal, timeout]);
  const doFetch = fetchOverride ?? ((url, init) => fetch(url, init));

  let res: Response;
  try {
    res = await doFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: config.model,
        messages: args.messages,
        stream: true,
        max_tokens: config.maxOutputTokens,
        temperature: 0.3,
        user: args.user,
      }),
      signal,
    });
  } catch (err) {
    if (timeout.aborted) throw new UpstreamError('The assistant took too long to answer. Please try again.', 504, true);
    if (args.signal.aborted) throw err;
    throw new UpstreamError('Could not reach the assistant. Please try again.', 502, true);
  }

  if (!res.ok || !res.body) {
    await res.body?.cancel().catch(() => undefined);
    throw upstreamErrorFor(res.status);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let finishReason: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let sawDone = false;

  try {
    while (!sawDone) {
      let chunk: ReadableStreamReadResult<string>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (timeout.aborted) throw new UpstreamError('The assistant took too long to answer. Please try again.', 504, true);
        if (args.signal.aborted) throw err;
        throw new UpstreamError('The connection to the assistant was interrupted. Please try again.', 502, true);
      }
      if (chunk.done) break;
      buffer += chunk.value;

      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        // Blank lines end an event; lines starting with ':' are keep-alive comments.
        if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          sawDone = true;
          break;
        }
        let parsed: {
          error?: { code?: number };
          choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        try {
          parsed = JSON.parse(data);
        } catch {
          continue; // a malformed line is skipped rather than ending the answer
        }
        if (parsed.error) throw upstreamErrorFor(Number(parsed.error.code) || 502);
        const choice = parsed.choices?.[0];
        const text = choice?.delta?.content;
        if (text) yield { type: 'delta', text };
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens ?? promptTokens;
          completionTokens = parsed.usage.completion_tokens ?? completionTokens;
        }
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }

  if (finishReason === 'error') throw upstreamErrorFor(502);
  yield { type: 'done', finishReason, promptTokens, completionTokens };
}
