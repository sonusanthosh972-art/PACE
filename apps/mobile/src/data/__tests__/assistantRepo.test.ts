import {
  clearAssistantMessages,
  deleteAssistantMessage,
  listAssistantMessages,
  MAX_STORED_MESSAGES,
  saveAssistantMessage,
} from '../assistantRepo';
import { migrate, type SqlDb } from '../db';
import { wipeAllLocalData } from '../settingsRepo';
import { createTestDb } from '../testing/nodeSqliteDb';

let db: SqlDb & { close(): void };

beforeEach(async () => {
  db = createTestDb();
  await migrate(db);
});
afterEach(() => db.close());

const msg = (i: number, role: 'user' | 'assistant' = 'user') => ({
  id: `m${i}`,
  role,
  content: `message ${i}`,
  status: 'done' as const,
  createdAt: 1_000 + i,
});

describe('assistant conversation on the phone', () => {
  it('keeps messages in order across app restarts', async () => {
    await saveAssistantMessage(db, msg(1));
    await saveAssistantMessage(db, msg(2, 'assistant'));
    expect((await listAssistantMessages(db)).map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('keeps only the newest messages', async () => {
    for (let i = 0; i < MAX_STORED_MESSAGES + 15; i++) await saveAssistantMessage(db, msg(i));
    const rows = await listAssistantMessages(db);
    expect(rows).toHaveLength(MAX_STORED_MESSAGES);
    expect(rows[0]?.id).toBe('m15');
  });

  it('removes a failed answer, clears the chat, and is wiped with all data', async () => {
    await saveAssistantMessage(db, msg(1));
    await saveAssistantMessage(db, { ...msg(2, 'assistant'), status: 'error' });
    await deleteAssistantMessage(db, 'm2');
    expect(await listAssistantMessages(db)).toHaveLength(1);
    await clearAssistantMessages(db);
    expect(await listAssistantMessages(db)).toEqual([]);
    await saveAssistantMessage(db, msg(3));
    await wipeAllLocalData(db);
    expect(await listAssistantMessages(db)).toEqual([]);
  });
});
