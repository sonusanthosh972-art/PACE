/// <reference types="node" />
/**
 * Test-only SqlDb backed by Node's built-in SQLite (node:sqlite), so repositories run real SQL
 * in Jest without a native module. Never imported by app code.
 */
import { DatabaseSync } from 'node:sqlite';

import type { RunResult, SqlDb, SqlValue } from '../db';

export function createTestDb(): SqlDb & { close(): void } {
  const db = new DatabaseSync(':memory:');
  return {
    async execAsync(source) {
      db.exec(source);
    },
    async runAsync(source, params: SqlValue[]): Promise<RunResult> {
      const res = db.prepare(source).run(...params);
      return { changes: Number(res.changes), lastInsertRowId: Number(res.lastInsertRowid) };
    },
    async getAllAsync<T>(source: string, params: SqlValue[]) {
      return db.prepare(source).all(...params) as T[];
    },
    async getFirstAsync<T>(source: string, params: SqlValue[]) {
      return (db.prepare(source).get(...params) as T | undefined) ?? null;
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}

/** Deterministic clock + id generator for tests. */
export function createTestClock(start = Date.UTC(2026, 9, 24, 4, 30)) {
  let now = start;
  let seq = 0;
  return {
    now: () => now,
    newId: () => `id-${String(++seq).padStart(4, '0')}`,
    set(ms: number) {
      now = ms;
    },
    advance(ms: number) {
      now += ms;
    },
  };
}
