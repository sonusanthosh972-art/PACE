/**
 * The Money Assistant conversation on this phone. Only the newest messages are kept; the server
 * never stores chat text.
 */
import type { SqlDb } from './db';

export const MAX_STORED_MESSAGES = 100;

export type AssistantRole = 'user' | 'assistant';
export type AssistantStatus = 'done' | 'error';

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  status: AssistantStatus;
  createdAt: number;
}

interface Row {
  id: string;
  role: AssistantRole;
  content: string;
  status: AssistantStatus;
  created_at: number;
}

/** Oldest first, as shown in the chat. */
export async function listAssistantMessages(db: SqlDb): Promise<AssistantMessage[]> {
  const rows = await db.getAllAsync<Row>(
    'SELECT id, role, content, status, created_at FROM assistant_messages ORDER BY created_at ASC, rowid ASC',
    [],
  );
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** Saves (or replaces) a message, then drops the oldest beyond the limit. */
export async function saveAssistantMessage(db: SqlDb, message: AssistantMessage): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO assistant_messages (id, role, content, status, created_at) VALUES (?, ?, ?, ?, ?)',
    [message.id, message.role, message.content, message.status, message.createdAt],
  );
  await db.runAsync(
    `DELETE FROM assistant_messages WHERE id NOT IN
       (SELECT id FROM assistant_messages ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
    [MAX_STORED_MESSAGES],
  );
}

export async function deleteAssistantMessage(db: SqlDb, id: string): Promise<void> {
  await db.runAsync('DELETE FROM assistant_messages WHERE id = ?', [id]);
}

export async function clearAssistantMessages(db: SqlDb): Promise<void> {
  await db.runAsync('DELETE FROM assistant_messages', []);
}
