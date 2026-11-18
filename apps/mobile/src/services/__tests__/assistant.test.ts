import {
  AssistantError,
  completeUtf8Length,
  historyForRequest,
  parseSse,
  streamAssistantReply,
} from '../assistant';

const mockApiStream = jest.fn();
jest.mock('../api/client', () => ({
  apiStream: (...args: unknown[]) => mockApiStream(...args),
  apiClient: jest.fn(),
}));
jest.mock('../sync', () => ({ syncNow: jest.fn().mockResolvedValue(undefined) }));

/** A streamed HTTP response whose body arrives in small, uneven pieces. */
function sseResponse(text: string, piece = 9): Response {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += piece) controller.enqueue(bytes.slice(i, i + piece));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const delta = (text: string) => `event: delta\ndata: ${JSON.stringify({ text })}\n\n`;
const signal = () => new AbortController().signal;

beforeEach(() => mockApiStream.mockReset());

describe('parseSse', () => {
  it('returns complete events and keeps the unfinished tail', () => {
    const { events, rest } = parseSse(
      'event: delta\ndata: {"text":"a"}\n\n: keep-alive\n\nevent: done\ndata: {}\n\nevent: del',
    );
    expect(events).toEqual([
      { event: 'delta', data: '{"text":"a"}' },
      { event: 'done', data: '{}' },
    ]);
    expect(rest).toBe('event: del');
  });
});

describe('historyForRequest', () => {
  it('sends finished turns only, ending with the question, at most 12', () => {
    const msgs = [
      ...Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `m${i}`,
        status: 'done' as const,
      })),
      { role: 'assistant' as const, content: 'Could not answer', status: 'error' as const },
    ];
    const out = historyForRequest(msgs);
    expect(out).toHaveLength(12);
    expect(out.at(-1)).toEqual({ role: 'user', content: 'm18' });
    expect(out.some((m) => m.content === 'Could not answer')).toBe(false);
  });
});

describe('streamAssistantReply', () => {
  it('streams text as it arrives and returns the full answer', async () => {
    mockApiStream.mockResolvedValue(
      sseResponse(
        `${delta('You have ')}${delta('**₹2,000** left.')}event: done\ndata: {"finishReason":"stop"}\n\n`,
      ),
    );
    const seen: string[] = [];
    const text = await streamAssistantReply({
      history: [{ role: 'user', content: 'How much is left?' }],
      signal: signal(),
      onText: (t) => seen.push(t),
    });
    expect(text).toBe('You have **₹2,000** left.');
    expect(seen).toEqual(['You have ', 'You have **₹2,000** left.']);
    expect(mockApiStream).toHaveBeenCalledWith(
      '/api/v1/assistant/chat',
      { messages: [{ role: 'user', content: 'How much is left?' }] },
      expect.anything(),
    );
  });

  it('turns an error event into a retryable AssistantError with its message', async () => {
    mockApiStream.mockResolvedValue(
      sseResponse(
        `${delta('Let me')}event: error\ndata: {"message":"The assistant is busy right now.","retryable":true}\n\n`,
      ),
    );
    await expect(
      streamAssistantReply({
        history: [{ role: 'user', content: 'q' }],
        signal: signal(),
        onText: () => undefined,
      }),
    ).rejects.toEqual(new AssistantError('The assistant is busy right now.', true));
  });

  it('passes the server message on for limits and sign-in problems', async () => {
    mockApiStream.mockRejectedValue(
      Object.assign(new Error("You've used today's questions."), { statusCode: 429 }),
    );
    const err = await streamAssistantReply({
      history: [{ role: 'user', content: 'q' }],
      signal: signal(),
      onText: () => undefined,
    }).catch((e: AssistantError) => e);
    expect(err).toBeInstanceOf(AssistantError);
    expect((err as AssistantError).message).toBe("You've used today's questions.");
    expect((err as AssistantError).retryable).toBe(false);
  });

  it('treats an empty answer as a failure', async () => {
    mockApiStream.mockResolvedValue(sseResponse('event: done\ndata: {}\n\n'));
    await expect(
      streamAssistantReply({
        history: [{ role: 'user', content: 'q' }],
        signal: signal(),
        onText: () => undefined,
      }),
    ).rejects.toBeInstanceOf(AssistantError);
  });
});

describe('completeUtf8Length', () => {
  it('holds back a character split across chunks', () => {
    const rupee = new TextEncoder().encode('a₹'); // 1 + 3 bytes
    expect(completeUtf8Length(rupee)).toBe(4);
    expect(completeUtf8Length(rupee.slice(0, 3))).toBe(1);
    expect(completeUtf8Length(rupee.slice(0, 2))).toBe(1);
  });
});
