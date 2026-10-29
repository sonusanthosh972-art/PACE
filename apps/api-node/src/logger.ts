import pino from 'pino';

/**
 * Structured JSON logs (one line per event) for Render's log viewer and any log drain.
 * Secrets in request headers are redacted; request bodies are never logged.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-admin-key"]', 'req.headers.cookie'],
    censor: '[redacted]',
  },
});
