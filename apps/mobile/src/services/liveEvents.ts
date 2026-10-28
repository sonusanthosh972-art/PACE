import type { SqlDb } from '@/data/db';
import type { Transaction } from '@/domain/transaction';

type Listener = (inserted: readonly Transaction[]) => void;

const listeners = new Set<Listener>();

/** UI subscribes to refresh when new transactions land (live SMS, import, manual add). */
export function subscribeToNewTransactions(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type Hook = (db: SqlDb, inserted: readonly Transaction[]) => Promise<void>;

const hooks: Hook[] = [];

/** Side effects that must also run headlessly (e.g. live notifications, Phase 6). */
export function registerNewTransactionHook(hook: Hook): void {
  hooks.push(hook);
}

type LocalChangeHook = (db: SqlDb) => void;

const localChangeHooks: LocalChangeHook[] = [];

/** Runs after the user edits local data (recategorise, exclude, delete, budget), e.g. to sync. */
export function registerLocalChangeHook(hook: LocalChangeHook): void {
  localChangeHooks.push(hook);
}

export function onLocalChange(db: SqlDb): void {
  for (const hook of localChangeHooks) hook(db);
}

export async function onNewTransactions(
  db: SqlDb,
  inserted: readonly Transaction[],
): Promise<void> {
  if (inserted.length === 0) return;
  for (const hook of hooks) {
    await hook(db, inserted);
  }
  for (const listener of listeners) listener(inserted);
}
