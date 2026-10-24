import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { DATABASE_NAME, migrate, type SqlDb } from './db';

function adapt(db: SQLiteDatabase): SqlDb {
  return {
    execAsync: (source) => db.execAsync(source),
    runAsync: (source, params) => db.runAsync(source, params),
    getAllAsync: <T>(source: string, params: Parameters<SqlDb['getAllAsync']>[1]) =>
      db.getAllAsync<T>(source, params),
    getFirstAsync: <T>(source: string, params: Parameters<SqlDb['getFirstAsync']>[1]) =>
      db.getFirstAsync<T>(source, params),
    withTransactionAsync: (task) => db.withTransactionAsync(task),
  };
}

let opening: Promise<SqlDb> | null = null;

/** The single app database, opened and migrated once per JS runtime (UI or headless). */
export function getAppDb(): Promise<SqlDb> {
  if (!opening) {
    opening = (async () => {
      const db = adapt(await openDatabaseAsync(DATABASE_NAME));
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await migrate(db);
      return db;
    })().catch((error: unknown) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}
