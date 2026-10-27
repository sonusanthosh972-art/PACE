import type {
  AdminDailySummary,
  AdminFixedExpense,
  AdminOverviewStats,
  AdminSystemHealth,
  AdminTransaction,
  AdminUser,
} from './types';

export interface LiveData {
  stats: AdminOverviewStats;
  health: AdminSystemHealth;
  users: AdminUser[];
  transactions: AdminTransaction[];
  fixedExpenses: AdminFixedExpense[];
  summaries: AdminDailySummary[];
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as (T & { title?: string; detail?: string }) | null;
  if (!res.ok || body === null) {
    throw new Error(body?.detail || body?.title || `Request to ${path} failed (${res.status})`);
  }
  return body;
}

/** Loads everything the dashboard shows from the API (through the Next.js proxy routes). */
export async function fetchLiveData(): Promise<LiveData> {
  const [overview, users, transactions, fixed, summaries] = await Promise.all([
    getJson<{ stats: AdminOverviewStats; health: AdminSystemHealth }>('/api/stats'),
    getJson<{ users: AdminUser[] }>('/api/users'),
    getJson<{ transactions: AdminTransaction[] }>('/api/transactions'),
    getJson<{ fixedExpenses: AdminFixedExpense[] }>('/api/fixed-expenses'),
    getJson<{ summaries: AdminDailySummary[] }>('/api/summaries'),
  ]);
  return {
    stats: overview.stats,
    health: overview.health,
    users: users.users,
    transactions: transactions.transactions,
    fixedExpenses: fixed.fixedExpenses,
    summaries: summaries.summaries,
  };
}
