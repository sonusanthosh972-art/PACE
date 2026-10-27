import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { closeDb, connectDb } from './db/mongo.js';
import { startDailySummaryCron } from './jobs/dailySummary.js';

async function bootstrap() {
  const config = loadConfig();

  console.log('[Bootstrap] Connecting to MongoDB...');
  await connectDb(config.mongoUri, config.databaseName);
  console.log(`[Bootstrap] Connected to database "${config.databaseName}" and ensured indexes.`);

  const cron = startDailySummaryCron();
  const server = createApp(config).listen(config.port, config.host, () => {
    console.log(`[PaisaPulse API] Listening on http://${config.host}:${config.port}`);
    if (!config.adminApiKey) {
      console.log('[PaisaPulse API] ADMIN_API_KEY not set: admin endpoints are disabled.');
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
