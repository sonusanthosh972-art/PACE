export type TabType =
  | 'overview'
  | 'users'
  | 'transactions'
  | 'fixed-expenses'
  | 'rules'
  | 'summaries'
  | 'subscriptions'
  | 'parser-sandbox'
  | 'health-logs';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  salaryPaise: number;
  payday: number;
  savingsGoalPaise: number;
  timezone: string;
  createdAt: number;
  lastActiveAt: number;
  txCount: number;
  status: 'active' | 'pending_setup' | 'idle';
}

export type Mode = 'UPI' | 'CARD' | 'ATM' | 'IMPS' | 'NEFT' | 'AUTOPAY' | 'OTHER';
export type Direction = 'debit' | 'credit';

export interface AdminTransaction {
  id: string;
  userId: string;
  userName?: string;
  amountPaise: number;
  direction: Direction;
  merchant: string | null;
  merchantNorm: string;
  vpa: string | null;
  mode: Mode;
  accountLast4: string | null;
  upiRef: string | null;
  balancePaise: number | null;
  category: string;
  needsReview: boolean;
  note: string | null;
  source: string;
  occurredAt: number;
  dedupeHash: string;
  isExcluded: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AdminFixedExpense {
  id: string;
  userId: string;
  userName?: string;
  name: string;
  amountPaise: number;
  dueDay: number;
  createdAt: number;
  frequency: string;
  category: string;
}

export interface AdminUserRule {
  id: string;
  userId?: string;
  pattern: string;
  category: string;
  matchCount: number;
  createdAt: number;
}

export interface AdminDailySummary {
  date: string;
  userId: string;
  userName?: string;
  budgetPaise: number;
  spentPaise: number;
  remainingPaise: number;
  daysLeft: number;
  streak: number;
  status: 'on_track' | 'near_limit' | 'overspent';
}

export interface AdminSubscription {
  id: string;
  userId: string;
  userName?: string;
  name: string;
  amountPaise: number;
  dueDay: number;
  confidence: 'high' | 'medium';
  reason: 'mandate' | 'known_service' | 'recurring';
  merchantNorm: string;
  lastOccurredAt: number;
  status: 'active' | 'paused' | 'suggested';
}

export interface AdminSystemHealth {
  database: 'connected' | 'disconnected' | 'degraded';
  latencyMs: number;
  activeUsers24h: number;
  rateLimitHits: number;
  totalSyncedTxs: number;
  memoryUsageMb: number;
  uptimeHours: number;
}

export interface AdminOverviewStats {
  totalUsers: number;
  activeUsers: number;
  totalVolumePaise: number;
  totalTransactionsCount: number;
  totalFixedExpensesPaise: number;
  totalSavingsGoalsPaise: number;
  todayVolumePaise: number;
  avgDailyBudgetPaise: number;
  exclusionRatio: number;
}

export interface AuditLogItem {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
  entity: string;
  details: string;
  status: 'success' | 'warning' | 'error';
}
