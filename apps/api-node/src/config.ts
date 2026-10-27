export interface ApiConfig {
  mongoUri: string;
  databaseName: string;
  jwtSecret: string;
  port: number;
  host: string;
  /** Browser origins allowed by CORS. Empty = CORS off (the mobile app and admin server don't need it). */
  corsOrigins: string[];
  /** Shared secret the admin dashboard sends as x-admin-key. Unset = admin endpoints disabled. */
  adminApiKey: string | null;
}

export const DEFAULT_DATABASE_NAME = 'paisapulse';
export const MIN_SECRET_LENGTH = 32;

/**
 * Reads configuration from the environment and fails fast with a clear message.
 * Values are never logged.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const mongoUri = env.MONGODB_URI?.trim();
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set. Copy apps/api-node/.env.example to .env and fill it in.');
  }

  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters long.`);
  }

  const adminApiKey = env.ADMIN_API_KEY?.trim() || null;
  if (adminApiKey && adminApiKey.length < MIN_SECRET_LENGTH) {
    throw new Error(`ADMIN_API_KEY must be at least ${MIN_SECRET_LENGTH} characters long.`);
  }

  const port = Number(env.PORT ?? 5080);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be a valid TCP port number.');
  }

  return {
    mongoUri,
    databaseName: env.MONGODB_DATABASE?.trim() || DEFAULT_DATABASE_NAME,
    jwtSecret,
    port,
    host: env.HOST?.trim() || '0.0.0.0',
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0 && o !== '*'),
    adminApiKey,
  };
}
