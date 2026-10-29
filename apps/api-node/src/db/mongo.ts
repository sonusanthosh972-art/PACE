import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDb(mongoUri: string, dbName: string): Promise<Db> {
  if (db) return db;

  client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db(dbName);

  // Initialize indexes to guarantee idempotency and uniqueness
  await initIndexes(db);

  return db;
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not initialized. Call connectDb first.');
  }
  return db;
}

export async function pingDb(): Promise<boolean> {
  try {
    const database = getDb();
    await database.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

async function initIndexes(database: Db) {
  // 1. users: unique email
  await database.collection('users').createIndex({ email: 1 }, { unique: true, name: 'ux_users_email' });
  await database.collection('users').createIndex({ id: 1 }, { unique: true, name: 'ux_users_id' });
  await database.collection('users').createIndex(
    { refreshTokenHash: 1 },
    { name: 'ix_users_refreshTokenHash', partialFilterExpression: { refreshTokenHash: { $type: 'string' } } }
  );

  // 1b. sessions: one per signed-in device; Mongo deletes expired ones automatically
  await database.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true, name: 'ux_sessions_tokenHash' });
  await database.collection('sessions').createIndex({ userId: 1 }, { name: 'ix_sessions_userId' });
  await database.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_sessions_expiresAt' });

  // 1c. authCodes: one active code per user and purpose, expired codes removed automatically
  await database.collection('authCodes').createIndex({ userId: 1, purpose: 1 }, { unique: true, name: 'ux_authCodes_user_purpose' });
  await database.collection('authCodes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_authCodes_expiresAt' });

  // 2. fixedExpenses: index on userId
  await database.collection('fixedExpenses').createIndex({ userId: 1 }, { name: 'ix_fixedExpenses_userId' });

  // 3. transactions: unique (userId, dedupeHash) - critical idempotency index
  await database.collection('transactions').createIndex(
    { userId: 1, dedupeHash: 1 },
    { unique: true, name: 'ux_transactions_userId_dedupeHash' }
  );
  await database.collection('transactions').createIndex(
    { userId: 1, occurredAt: -1 },
    { name: 'ix_transactions_userId_occurredAt' }
  );
  await database.collection('transactions').createIndex(
    { userId: 1, category: 1 },
    { name: 'ix_transactions_userId_category' }
  );

  // 4. userRules: compound index on (userId, pattern)
  await database.collection('userRules').createIndex(
    { userId: 1, pattern: 1 },
    { name: 'ix_userRules_userId_pattern' }
  );

  // 5. dailySummaries: unique (userId, dateKey)
  await database.collection('dailySummaries').createIndex(
    { userId: 1, dateKey: 1 },
    { unique: true, name: 'ux_dailySummaries_userId_dateKey' }
  );
}
