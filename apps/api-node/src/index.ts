import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import * as Sentry from '@sentry/node';
if (process.env.SENTRY_DSN) {
  // Errors only (no tracing), and never request bodies or user details.
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0, sendDefaultPii: false });
}

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { closeDb, connectDb } from './db/mongo.js';
import { startDailySummaryCron } from './jobs/dailySummary.js';
import { logger } from './logger.js';

async function bootstrap() {
  const config = loadConfig();

  logger.info('[Bootstrap] Connecting to MongoDB...');
  await connectDb(config.mongoUri, config.databaseName);
  logger.info(`[Bootstrap] Connected to database "${config.databaseName}" and ensured indexes.`);

  const cron = startDailySummaryCron();
  const server = createApp(config).listen(config.port, config.host, () => {
    logger.info(`[PaisaPulse API] Listening on http://${config.host}:${config.port}`);
    if (!config.adminApiKey) {
      logger.warn('[PaisaPulse API] ADMIN_API_KEY not set: admin endpoints are disabled.');
    }
  });

  const shutdown = () => {
    cron.stop();
    server.close(() => {
      void closeDb().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err: unknown) => {
  console.error('[Bootstrap] Fatal startup error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
