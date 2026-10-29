import crypto from 'node:crypto';
import express, { Request, Response } from 'express';
import compression from 'compression';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import type { ApiConfig } from './config.js';
import { pingDb } from './db/mongo.js';
import { recordRateLimitHit } from './metrics.js';
import { errorHandler, notFound, problem } from './http.js';
import { requireAdminKey } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { transactionsRouter } from './routes/transactions.js';
import { insightsRouter } from './routes/insights.js';
import { adminRouter } from './routes/admin.js';

export interface RateLimits {
  authPerMinute: number;
  apiPerMinute: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = { authPerMinute: 10, apiPerMinute: 100 };

export function createApp(
  config: Pick<ApiConfig, 'corsOrigins' | 'adminApiKey'> & Partial<Pick<ApiConfig, 'trustProxyHops'>>,
  limits: RateLimits = DEFAULT_RATE_LIMITS,
) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxyHops) app.set('trust proxy', config.trustProxyHops);

  // Request id on every request and response, so a user's error can be found in the logs.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));

  // The phone app and the admin server call the API directly, so CORS stays off unless
  // specific browser origins are configured.
  if (config.corsOrigins.length > 0) {
    app.use(cors({ origin: config.corsOrigins }));
  }

  const limiter = (max: number) =>
    rateLimit({
      windowMs: 60 * 1000,
      limit: max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) => {
        recordRateLimitHit();
        problem(res, 429, 'Too Many Requests', 'Rate limit exceeded. Try again shortly.');
      },
    });

  const health = async (_req: Request, res: Response) => {
    if (await pingDb()) {
      res.status(200).json({ status: 'healthy', database: 'connected' });
    } else {
      problem(res, 503, 'Database unavailable');
    }
  };
  app.get('/health', health);
  app.get('/api/v1/health', health);

  app.use('/api/v1/auth', limiter(limits.authPerMinute), authRouter);
  app.use('/api/v1/me', limiter(limits.apiPerMinute), meRouter);
  app.use('/api/v1/transactions', limiter(limits.apiPerMinute), transactionsRouter);
  app.use('/api/v1/insights', limiter(limits.apiPerMinute), insightsRouter);
  app.use('/api/v1/admin', limiter(limits.apiPerMinute), requireAdminKey(config.adminApiKey), adminRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
