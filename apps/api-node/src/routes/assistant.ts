import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { logger } from '../logger.js';
import { recordRateLimitHit } from '../metrics.js';
import { problem, validationProblem } from '../http.js';
import { type AuthenticatedRequest, requireAuth, userIdOf } from '../middleware/auth.js';
import { buildMessages, checkQuota, MAX_MESSAGE_CHARS, recordUsage } from '../services/assistant.js';
import { buildFinancialContext } from '../services/financialContext.js';
import { loadAssistantConfig, streamChat, UpstreamError } from '../services/openrouter.js';

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
      }),
    )
    .min(1)
    .max(40)
    .refine((m) => m[m.length - 1]?.role === 'user', 'The last message must be from the user.'),
});

/** Users with an answer being generated right now: one at a time each, so taps can't stack up. */
const inFlight = new Set<string>();

/** Stable pseudonym sent to the provider for abuse isolation (never the email or raw id). */
function pseudonym(userId: string): string {
  return crypto.createHash('sha256').update(`pace-assistant:${userId}`).digest('hex').slice(0, 32);
}

function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createAssistantRouter(perMinute = loadAssistantConfig().perMinuteLimit) {
  const router = Router();
  router.use(requireAuth);
  router.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: perMinute,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (req) => `assistant:${(req as AuthenticatedRequest).userId}`,
      handler: (_req, res) => {
        recordRateLimitHit();
        problem(res, 429, 'Too Many Requests', 'You are asking very quickly. Wait a minute and try again.');
      },
    }),
  );

  // GET /api/v1/assistant/status — whether the assistant is on, and today's remaining questions.
  router.get('/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const config = loadAssistantConfig();
    const usage = await checkQuota(userIdOf(req), config, Date.now());
    res.status(200).json({
      enabled: Boolean(config.apiKey),
      dailyMessageLimit: config.dailyMessageLimit,
      usedToday: usage.requests,
      remainingToday: usage.allowed ? Math.max(0, config.dailyMessageLimit - usage.requests) : 0,
      maxMessageChars: MAX_MESSAGE_CHARS,
    });
  });

  // POST /api/v1/assistant/chat — streams the answer as server-sent events:
  //   event: delta {"text"}  …  then  event: done {"finishReason"}  or  event: error {"message","retryable"}
  router.post('/chat', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      validationProblem(res, parsed.error);
      return;
    }
    const userId = userIdOf(req);
    const config = loadAssistantConfig();
    if (!config.apiKey) {
      problem(res, 503, 'Assistant not configured', 'The Money Assistant is not switched on for this server yet.');
      return;
    }
    if (inFlight.has(userId)) {
      problem(res, 409, 'Already answering', 'Wait for the current answer to finish.');
      return;
    }

    const now = Date.now();
    inFlight.add(userId);
    try {
      const quota = await checkQuota(userId, config, now);
      if (!quota.allowed) {
        problem(res, 429, 'Daily limit reached', "You've used today's questions. The assistant is back tomorrow.");
        return;
      }

      const messages = parsed.data.messages;
      const question = messages[messages.length - 1]?.content ?? '';
      const context = await buildFinancialContext(userId, now, question);
      if (!context) {
        problem(res, 404, 'User not found');
        return;
      }

      // Counted before calling out, so cancelling mid-answer still uses a question.
      await recordUsage(userId, now, { requests: 1 });

      const abort = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) abort.abort();
      });

      const started = Date.now();
      let headersSent = false;
      try {
        for await (const event of streamChat({
          config,
          messages: buildMessages(context, messages),
          user: pseudonym(userId),
          signal: abort.signal,
        })) {
          if (!headersSent) {
            res.status(200).set({
              'Content-Type': 'text/event-stream; charset=utf-8',
              // no-transform keeps the compression middleware from buffering the stream.
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            });
            res.flushHeaders();
            headersSent = true;
          }
          if (event.type === 'delta') {
            sse(res, 'delta', { text: event.text });
          } else {
            sse(res, 'done', { finishReason: event.finishReason });
            await recordUsage(userId, now, {
              promptTokens: event.promptTokens,
              completionTokens: event.completionTokens,
            });
            logger.info(
              {
                model: config.model,
                promptTokens: event.promptTokens,
                completionTokens: event.completionTokens,
                ms: Date.now() - started,
                finishReason: event.finishReason,
              },
              '[Assistant] answered',
            );
          }
        }
        res.end();
      } catch (err) {
        if (abort.signal.aborted) {
          res.end();
          return; // the phone went away; nothing to tell it
        }
        const upstream =
          err instanceof UpstreamError ? err : new UpstreamError('The assistant is having trouble right now. Please try again.', 502, true);
        if (!(err instanceof UpstreamError)) logger.error({ err }, '[Assistant] unexpected failure');
        else logger.warn({ status: upstream.status, model: config.model }, '[Assistant] provider error');
        if (headersSent) {
          sse(res, 'error', { message: upstream.message, retryable: upstream.retryable });
          res.end();
        } else {
          problem(res, upstream.status, 'Assistant unavailable', upstream.message);
        }
      }
    } finally {
      inFlight.delete(userId);
    }
  });

  return router;
}
