import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { closeDb, connectDb, getDb } from '../src/db/mongo.js';
import { buildSummaryForUser } from '../src/jobs/dailySummary.js';
import type { UserDoc } from '../src/db/models.js';

const ADMIN_KEY = 'a'.repeat(40);
process.env.JWT_SECRET = 's'.repeat(48);

let mongo: MongoMemoryServer;
let server: Server;
let base: string;

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

let emailSeq = 0;
async function register() {
  const email = `user${++emailSeq}@example.com`;
  const res = await call('POST', '/api/v1/auth/register', { email, password: 'password123', name: 'Asha' });
  assert.equal(res.status, 201);
  return { email, auth: { Authorization: `Bearer ${res.json.accessToken}` }, refreshToken: res.json.refreshToken as string };
}

/** Exactly the shape apps/mobile/src/services/sync.ts sends. */
function mobileTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    amountPaise: 25000,
    direction: 'debit',
    merchant: 'Swiggy',
    merchantNorm: 'swiggy',
    vpa: 'swiggy@icici',
    mode: 'UPI',
    accountLast4: '1234',
    upiRef: '412345678901',
    balancePaise: null,
    category: 'food',
    needsReview: false,
    note: null,
    source: 'sms',
    occurredAt: Date.now() - 60_000,
    dedupeHash: 'a'.repeat(64),
    isExcluded: false,
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now() - 60_000,
    ...overrides,
  };
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  const config = loadConfig({ MONGODB_URI: mongo.getUri(), JWT_SECRET: process.env.JWT_SECRET, ADMIN_API_KEY: ADMIN_KEY });
  await connectDb(config.mongoUri, 'paisapulse_test');
  server = createApp(config, { authPerMinute: 1000, apiPerMinute: 1000 }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await closeDb();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all(['transactions', 'fixedExpenses', 'dailySummaries'].map((c) => getDb().collection(c).deleteMany({})));
});

describe('config', () => {
  it('fails fast without MONGODB_URI and with a short JWT secret', () => {
    assert.throws(() => loadConfig({ JWT_SECRET: 's'.repeat(40) }), /MONGODB_URI/);
    assert.throws(() => loadConfig({ MONGODB_URI: 'mongodb://x', JWT_SECRET: 'short' }), /JWT_SECRET/);
  });

  it('defaults to the paisapulse database with CORS off', () => {
    const c = loadConfig({ MONGODB_URI: 'mongodb://x', JWT_SECRET: 's'.repeat(40), CORS_ORIGINS: '*' });
    assert.equal(c.databaseName, 'paisapulse');
    assert.deepEqual(c.corsOrigins, []);
  });
});

describe('health', () => {
  it('reports healthy on the path the mobile app pings', async () => {
    const res = await call('GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'healthy');
  });
});

describe('auth', () => {
  it('registers, rejects duplicates and bad passwords, logs in', async () => {
    const { email } = await register();
    assert.equal((await call('POST', '/api/v1/auth/register', { email, password: 'password123', name: 'X' })).status, 409);
    assert.equal((await call('POST', '/api/v1/auth/login', { email, password: 'wrong-password' })).status, 401);
    const ok = await call('POST', '/api/v1/auth/login', { email: email.toUpperCase(), password: 'password123' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.user.email, email);
  });

  it('rotates refresh tokens and rejects a replayed one', async () => {
    const { refreshToken } = await register();
    const first = await call('POST', '/api/v1/auth/refresh', { refreshToken });
    assert.equal(first.status, 200);
    assert.notEqual(first.json.refreshToken, refreshToken);
    assert.equal((await call('POST', '/api/v1/auth/refresh', { refreshToken })).status, 401);
  });

  it('stores only a hash of the refresh token', async () => {
    const { email, refreshToken } = await register();
    const user = await getDb().collection<UserDoc>('users').findOne({ email });
    assert.ok(user?.refreshTokenHash);
    assert.notEqual(user?.refreshTokenHash, refreshToken);
    assert.equal(user?.refreshTokenHash?.length, 64);
  });

  it('rejects requests without a valid bearer token', async () => {
    assert.equal((await call('GET', '/api/v1/me/profile')).status, 401);
    assert.equal((await call('GET', '/api/v1/me/profile', undefined, { Authorization: 'Bearer nope' })).status, 401);
  });
});

describe('sync contract with the mobile app', () => {
  it('returns inserted/updated/totalProcessed and is idempotent on dedupeHash', async () => {
    const { auth } = await register();
    const first = await call('POST', '/api/v1/transactions/sync', { transactions: [mobileTx()] }, auth);
    assert.equal(first.status, 200);
    assert.deepEqual(first.json, { inserted: 1, updated: 0, totalProcessed: 1 });

    const again = await call('POST', '/api/v1/transactions/sync', { transactions: [mobileTx({ category: 'coffee' })] }, auth);
    assert.deepEqual(again.json, { inserted: 0, updated: 1, totalProcessed: 1 });

    const list = await call('GET', '/api/v1/transactions?page=1&pageSize=200', undefined, auth);
    assert.equal(list.json.totalCount, 1);
    assert.equal(list.json.items[0].category, 'coffee');
    assert.equal(list.json.items[0]._id, undefined);
    assert.equal(list.json.items[0].userId, undefined);
  });

  it('rejects raw SMS text and invalid fields', async () => {
    const { auth } = await register();
    const raw = await call('POST', '/api/v1/transactions/sync', { transactions: [mobileTx({ body: 'Rs 250 debited' })] }, auth);
    assert.equal(raw.status, 400);
    const bad = await call('POST', '/api/v1/transactions/sync', { transactions: [mobileTx({ category: 'nope' })] }, auth);
    assert.equal(bad.status, 400);
  });

  it('keeps every user isolated', async () => {
    const a = await register();
    const b = await register();
    await call('POST', '/api/v1/transactions/sync', { transactions: [mobileTx()] }, a.auth);
    const bList = await call('GET', '/api/v1/transactions', undefined, b.auth);
    assert.equal(bList.json.totalCount, 0);
    assert.equal((await call('PATCH', '/api/v1/transactions/tx-1', { category: 'other' }, b.auth)).status, 404);
    // Same dedupeHash for another user is a separate record.
    const bSync = await call('POST', '/api/v1/transactions/sync', { transactions: [mobileTx()] }, b.auth);
    assert.equal(bSync.json.inserted, 1);
  });
});

describe('profile and fixed expenses', () => {
  it('round-trips the profile and fixed expenses the way the mobile app syncs them', async () => {
    const { auth } = await register();
    const profile = await call('PUT', '/api/v1/me/profile', { salaryPaise: 50_000_00, payday: 1, savingsGoalPaise: 5_000_00 }, auth);
    assert.equal(profile.status, 200);
    assert.equal(profile.json.salaryPaise, 50_000_00);

    const fixed = await call('PUT', '/api/v1/me/fixed-expenses', [{ id: 'rent', name: 'Rent', amountPaise: 15_000_00, dueDay: 5 }], auth);
    assert.equal(fixed.status, 200);
    const got = await call('GET', '/api/v1/me/fixed-expenses', undefined, auth);
    assert.deepEqual(got.json, [{ id: 'rent', name: 'Rent', amountPaise: 15_000_00, dueDay: 5 }]);
  });

  it('deletes the account and all its data', async () => {
    const { auth, email } = await register();
    await call('POST', '/api/v1/transactions/sync', { transactions: [mobileTx()] }, auth);
    assert.equal((await call('DELETE', '/api/v1/me', undefined, auth)).status, 204);
    assert.equal(await getDb().collection('users').countDocuments({ email }), 0);
    assert.equal(await getDb().collection('transactions').countDocuments({}), 0);
  });
});

describe('insights and nightly job', () => {
  it('nets refunds and ignores fixed and excluded payments', async () => {
    const { auth, email } = await register();
    await call('PUT', '/api/v1/me/profile', { salaryPaise: 60_000_00, payday: 1, savingsGoalPaise: 0 }, auth);
    const now = Date.now();
    await call(
      'POST',
      '/api/v1/transactions/sync',
      {
        transactions: [
          mobileTx({ id: 't1', dedupeHash: '1'.repeat(64), amountPaise: 1000_00, occurredAt: now }),
          mobileTx({ id: 't2', dedupeHash: '2'.repeat(64), amountPaise: 300_00, direction: 'credit', category: 'shopping', occurredAt: now }),
          mobileTx({ id: 't3', dedupeHash: '3'.repeat(64), amountPaise: 9000_00, category: 'rent_emi', occurredAt: now }),
          mobileTx({ id: 't4', dedupeHash: '4'.repeat(64), amountPaise: 500_00, isExcluded: true, occurredAt: now }),
        ],
      },
      auth,
    );
    const cycle = await call('GET', '/api/v1/insights/cycle', undefined, auth);
    assert.equal(cycle.status, 200);
    assert.equal(cycle.json.totalSpendPaise, 700_00);
    assert.equal(cycle.json.cycle.start.slice(-2), '01');

    const user = await getDb().collection<UserDoc>('users').findOne({ email });
    assert.ok(user);
    const { toDateKey } = await import('../src/domain.js');
    const summary = await buildSummaryForUser(user, toDateKey(now));
    assert.equal(summary.spentPaise, 700_00);
    assert.ok(summary.budgetPaise > 0);
  });
});

describe('admin API', () => {
  it('is locked without the admin key and works with it', async () => {
    assert.equal((await call('GET', '/api/v1/admin/stats')).status, 401);
    assert.equal((await call('GET', '/api/v1/admin/users', undefined, { 'x-admin-key': 'wrong' })).status, 401);

    const { auth } = await register();
    await call('POST', '/api/v1/transactions/sync', { transactions: [mobileTx()] }, auth);
    const key = { 'x-admin-key': ADMIN_KEY };
    const stats = await call('GET', '/api/v1/admin/stats', undefined, key);
    assert.equal(stats.status, 200);
    assert.equal(stats.json.stats.totalTransactionsCount, 1);
    assert.equal(stats.json.stats.activeUsers, 1);

    const users = await call('GET', '/api/v1/admin/users', undefined, key);
    assert.equal(users.json.users[0].passwordHash, undefined);
    for (const path of ['transactions', 'fixed-expenses', 'summaries']) {
      assert.equal((await call('GET', `/api/v1/admin/${path}`, undefined, key)).status, 200);
    }
  });

  it('is disabled when no admin key is configured', async () => {
    const app = createApp({ corsOrigins: [], adminApiKey: null }, { authPerMinute: 2, apiPerMinute: 100 });
    const s = app.listen(0, '127.0.0.1');
    await new Promise((r) => s.once('listening', r));
    const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/v1/admin/stats`);
    assert.equal(res.status, 503);
    // Same app: the auth limiter kicks in after the configured number of attempts.
    const login = () =>
      fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/v1/auth/login`, { method: 'POST' });
    await login();
    await login();
    assert.equal((await login()).status, 429);
    await new Promise((r) => s.close(r));
  });
});
