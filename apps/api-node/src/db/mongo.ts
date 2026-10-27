import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDb(): Promise<Db> {
  if (db) return db;

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set in environment variables');
  }

  const dbName = process.env.MONGODB_DATABASE || 'kailvarn';

  client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db(dbName);

  // Initialize indexes to guarantee idempotency and uniqueness
  await initIndexes(db);

  return db;
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
