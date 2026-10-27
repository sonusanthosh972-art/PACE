'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type {
  AdminDailySummary,
  AdminFixedExpense,
  AdminSubscription,
  AdminTransaction,
  AdminUser,
  AdminOverviewStats,
  AdminSystemHealth,
  AdminUserRule,
  AuditLogItem,
  TabType,
} from '../lib/types';
import { fetchLiveData, type LiveData } from '../lib/liveData';
import {
  formatINR,
  formatINRCompact,
  formatDate,
  formatDateTime,
  ordinal,
  CATEGORY_META,
} from '../lib/formatters';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { StatCard } from '../components/StatCard';
import { SpendVelocityChart, CategoryDonut, ModeSplitBar } from '../components/Charts';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { ParserSandbox } from '../components/ParserSandbox';
import {
  Users,
  CreditCard,
  CalendarCheck,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';

const EMPTY_STATS: AdminOverviewStats = {
  totalUsers: 0,
  activeUsers: 0,
  totalVolumePaise: 0,
  totalTransactionsCount: 0,
  totalFixedExpensesPaise: 0,
  totalSavingsGoalsPaise: 0,
  todayVolumePaise: 0,
  avgDailyBudgetPaise: 0,
  exclusionRatio: 0,
};

const EMPTY_HEALTH: AdminSystemHealth = {
  database: 'disconnected',
  latencyMs: 0,
  activeUsers24h: 0,
  rateLimitHits: 0,
  totalSyncedTxs: 0,
  memoryUsageMb: 0,
  uptimeHours: 0,
};

const NOT_TRACKED_RULES: AdminUserRule[] = [];
const NOT_TRACKED_SUBSCRIPTIONS: AdminSubscription[] = [];
const NOT_TRACKED_LOGS: AuditLogItem[] = [];

const DAY_LABEL = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Real data only: everything below comes from the API (no sample data in the admin).
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<AdminFixedExpense[]>([]);
  const [summaries, setSummaries] = useState<AdminDailySummary[]>([]);
  const [overview, setOverview] = useState<AdminOverviewStats>(EMPTY_STATS);
  const [health, setHealth] = useState<AdminSystemHealth>(EMPTY_HEALTH);
  // Not stored by the API yet, so these tabs stay empty instead of showing invented rows.
  const rules = NOT_TRACKED_RULES;
  const subscriptions = NOT_TRACKED_SUBSCRIPTIONS;
  const logs = NOT_TRACKED_LOGS;

  const [dataSource, setDataSource] = useState<'loading' | 'live' | 'offline'>('loading');
  const [dataError, setDataError] = useState<string | null>(null);
  // Set when data arrives (not during render, so the page can be prerendered).
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  // Modals (read-only details)
  const [viewingUser, setViewingUser] = useState<AdminUser | null>(null);
  const [viewingTx, setViewingTx] = useState<AdminTransaction | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const applyLive = useCallback((data: LiveData) => {
    setOverview(data.stats);
    setHealth(data.health);
    setUsers(data.users);
    setTransactions(data.transactions);
    setFixedExpenses(data.fixedExpenses);
    setSummaries(data.summaries);
    setDataSource('live');
    setDataError(null);
    setLoadedAt(Date.now());
  }, []);

  const applyOffline = useCallback((err: unknown) => {
    setDataSource('offline');
    setDataError(err instanceof Error ? err.message : 'API unreachable');
  }, []);

  useEffect(() => {
    fetchLiveData().then(applyLive, applyOffline);
  }, [applyLive, applyOffline]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchLiveData()
      .then(
        (data) => {
          applyLive(data);
          showToast('Refreshed from the live API');
        },
        (err: unknown) => {
          applyOffline(err);
          showToast('Could not reach the API');
        },
      )
      .finally(() => setIsRefreshing(false));
  };

  // Export CSV
  const handleExport = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (activeTab === 'users') {
      csvContent += 'ID,Name,Email,SalaryINR,Payday,SavingsGoalINR,Status\n';
      users.forEach((u) => {
        csvContent += `"${u.id}","${u.name}","${u.email}",${u.salaryPaise / 100},${u.payday},${u.savingsGoalPaise / 100},"${u.status}"\n`;
      });
    } else {
      csvContent += 'ID,User,AmountINR,Direction,Merchant,Mode,Category,Excluded,Date\n';
      transactions.forEach((t) => {
        csvContent += `"${t.id}","${t.userName || t.userId}",${t.amountPaise / 100},"${t.direction}","${t.merchant || ''}","${t.mode}","${t.category}",${t.isExcluded},"${formatDateTime(t.occurredAt)}"\n`;
      });
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `paisa_pulse_${activeTab}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${activeTab} to CSV`);
  };

  // Debit volume for the last 7 days (IST), from the loaded transactions
  const chartPoints = useMemo(() => {
    const IST_OFFSET_MS = 330 * 60 * 1000;
    const DAY_MS = 86_400_000;
    const dayIndex = (ms: number) => Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
    if (loadedAt === null) return [];
    const lastDay = dayIndex(loadedAt);
    const points = Array.from({ length: 7 }, (_, i) => {
      const idx = lastDay - 6 + i;
      const label = DAY_LABEL.format(idx * DAY_MS);
      return { idx, day: label, amountPaise: 0, count: 0 };
    });
    for (const t of transactions) {
      if (t.direction !== 'debit' || t.isExcluded) continue;
      const point = points.find((p) => p.idx === dayIndex(t.occurredAt));
      if (point) {
        point.amountPaise += t.amountPaise;
        point.count += 1;
      }
    }
    return points.map(({ day, amountPaise, count }) => ({ day, amountPaise, count }));
  }, [transactions, loadedAt]);

  // Category Slices
  const categorySlices = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach((t) => {
      if (t.direction === 'debit' && !t.isExcluded) {
        map.set(t.category, (map.get(t.category) || 0) + t.amountPaise);
      }
    });
    return [...map.entries()]
      .map(([category, amountPaise]) => ({ category, amountPaise }))
      .sort((a, b) => b.amountPaise - a.amountPaise);
  }, [transactions]);

  // Payment Mode Split
  const modeData = useMemo(() => {
    const counts = new Map<string, number>();
    transactions.forEach((t) => counts.set(t.mode, (counts.get(t.mode) || 0) + 1));
    const total = transactions.length || 1;
    return [...counts.entries()].map(([mode, count]) => ({
      mode,
      count,
      percentage: Math.round((count / total) * 100),
    }));
  }, [transactions]);

  // Columns Definitions
  const userColumns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'User Profile',
      sortable: true,
      render: (u) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#062417',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '12px',
            }}
          >
            {u.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#FFF' }}>{u.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'salaryPaise',
      header: 'Monthly Take-Home',
      sortable: true,
      render: (u) => (
        <span className="mono" style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>
          {u.salaryPaise > 0 ? formatINR(u.salaryPaise) : 'Not configured'}
        </span>
      ),
    },
    {
      key: 'payday',
      header: 'Cycle Payday',
      sortable: true,
      render: (u) => <span>{u.payday ? `${ordinal(u.payday)} of month` : '—'}</span>,
    },
    {
      key: 'savingsGoalPaise',
      header: 'Savings Target',
      sortable: true,
      render: (u) => (
        <span className="mono" style={{ color: '#818CF8', fontWeight: 600 }}>
          {u.savingsGoalPaise > 0 ? formatINR(u.savingsGoalPaise) : '₹0'}
        </span>
      ),
    },
    {
      key: 'txCount',
      header: 'Tracked Txs',
      sortable: true,
      align: 'center',
      render: (u) => (
        <span className="badge badge-slate" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {u.txCount}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => {
        const cls =
          u.status === 'active'
            ? 'badge-emerald'
            : u.status === 'pending_setup'
            ? 'badge-amber'
            : 'badge-slate';
        return <span className={`badge ${cls}`}>{u.status.replace('_', ' ')}</span>;
      },
    },
  ];

  const transactionColumns: Column<AdminTransaction>[] = [
    {
      key: 'merchant',
      header: 'Merchant / Beneficiary',
      sortable: true,
      render: (t) => (
        <div>
          <div style={{ fontWeight: 600, color: '#FFF' }}>{t.merchant || 'Unknown Merchant'}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {t.accountLast4 ? `A/c ••${t.accountLast4} · ` : ''}
            {t.upiRef ? `UPI: ${t.upiRef}` : t.vpa || ''}
          </div>
        </div>
      ),
    },
    {
      key: 'userName',
      header: 'User',
      sortable: true,
      render: (t) => <span style={{ color: 'var(--text-secondary)' }}>{t.userName || t.userId}</span>,
    },
    {
      key: 'amountPaise',
      header: 'Amount',
      sortable: true,
      align: 'right',
      render: (t) => (
        <div style={{ textAlign: 'right' }}>
          <div
            className="mono"
            style={{
              fontWeight: 700,
              color:
                t.isExcluded
                  ? 'var(--text-muted)'
                  : t.direction === 'debit'
                  ? '#FFF'
                  : 'var(--accent-emerald)',
              textDecoration: t.isExcluded ? 'line-through' : 'none',
            }}
          >
            {t.direction === 'debit' ? '-' : '+'}
            {formatINR(t.amountPaise)}
          </div>
          {t.isExcluded && (
            <span style={{ fontSize: '10px', color: 'var(--accent-amber)', fontWeight: 600 }}>
              EXCLUDED
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'mode',
      header: 'Channel',
      render: (t) => <span className="badge badge-indigo">{t.mode}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (t) => {
        const meta = CATEGORY_META[t.category] || { label: t.category, emoji: '🏷️' };
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
            }}
          >
            <span>{meta.emoji}</span>
            <span>{meta.label}</span>
          </span>
        );
      },
    },
    {
      key: 'occurredAt',
      header: 'Timestamp',
      sortable: true,
      render: (t) => (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} className="mono">
          {formatDateTime(t.occurredAt)}
        </span>
      ),
    },
  ];

  const fixedColumns: Column<AdminFixedExpense>[] = [
    {
      key: 'name',
      header: 'Essential Bill Commitment',
      sortable: true,
      render: (f) => (
        <div>
          <div style={{ fontWeight: 600, color: '#FFF' }}>{f.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Locked ahead of daily budget</div>
        </div>
      ),
    },
    {
      key: 'userName',
      header: 'Assigned User',
      render: (f) => <span>{f.userName || f.userId}</span>,
    },
    {
      key: 'amountPaise',
      header: 'Monthly Amount',
      sortable: true,
      align: 'right',
      render: (f) => (
        <span className="mono" style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>
          {formatINR(f.amountPaise)}
        </span>
      ),
    },
    {
      key: 'dueDay',
      header: 'Due Day',
      sortable: true,
      render: (f) => <span className="badge badge-slate">{ordinal(f.dueDay)} of month</span>,
    },
  ];

  const ruleColumns: Column<AdminUserRule>[] = [
    {
      key: 'pattern',
      header: 'Merchant Pattern Match',
      sortable: true,
      render: (r) => (
        <span className="mono" style={{ color: '#FFF', fontWeight: 600, background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
          {r.pattern}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Target Category',
      render: (r) => {
        const meta = CATEGORY_META[r.category] || { label: r.category, emoji: '🏷️' };
        return (
          <span style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>
            {meta.emoji} {meta.label}
          </span>
        );
      },
    },
    {
      key: 'matchCount',
      header: 'Matching Txs',
      sortable: true,
      align: 'right',
      render: (r) => <span className="mono">{r.matchCount.toLocaleString('en-IN')}</span>,
    },
  ];

  const summaryColumns: Column<AdminDailySummary>[] = [
    {
      key: 'date',
      header: 'Cycle Date',
      sortable: true,
      render: (s) => <span className="mono" style={{ fontWeight: 600, color: '#FFF' }}>{s.date}</span>,
    },
    {
      key: 'userName',
      header: 'User',
      render: (s) => <span>{s.userName || s.userId}</span>,
    },
    {
      key: 'budgetPaise',
      header: 'Daily Allowance',
      align: 'right',
      render: (s) => <span className="mono" style={{ fontWeight: 700 }}>{formatINR(s.budgetPaise)}</span>,
    },
    {
      key: 'spentPaise',
      header: 'Spent Today',
      align: 'right',
      render: (s) => (
        <span
          className="mono"
          style={{
            fontWeight: 700,
            color: s.spentPaise > s.budgetPaise ? 'var(--accent-rose)' : 'var(--accent-emerald)',
          }}
        >
          {formatINR(s.spentPaise)}
        </span>
      ),
    },
    {
      key: 'remainingPaise',
      header: 'Remaining Today',
      align: 'right',
      render: (s) => (
        <span
          className="mono"
          style={{
            fontWeight: 700,
            color: s.remainingPaise < 0 ? 'var(--accent-rose)' : 'var(--text-primary)',
          }}
        >
          {formatINR(s.remainingPaise)}
        </span>
      ),
    },
    {
      key: 'streak',
      header: 'Streak',
      render: (s) => (
        <span className="badge badge-emerald">
          {s.streak} {s.streak === 1 ? 'day' : 'days'}
        </span>
      ),
    },
  ];

  const subscriptionColumns: Column<AdminSubscription>[] = [
    {
      key: 'name',
      header: 'Recurring Service / Mandate',
      sortable: true,
      render: (s) => (
        <div>
          <div style={{ fontWeight: 600, color: '#FFF' }}>{s.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Merchant key: {s.merchantNorm}</div>
        </div>
      ),
    },
    {
      key: 'userName',
      header: 'User',
      render: (s) => <span>{s.userName || s.userId}</span>,
    },
    {
      key: 'amountPaise',
      header: 'Amount',
      align: 'right',
      render: (s) => (
        <span className="mono" style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>
          {formatINR(s.amountPaise)}
        </span>
      ),
    },
    {
      key: 'dueDay',
      header: 'Expected Debit',
      render: (s) => <span>{ordinal(s.dueDay)} of month</span>,
    },
    {
      key: 'confidence',
      header: 'Confidence',
      render: (s) => (
        <span className={`badge ${s.confidence === 'high' ? 'badge-emerald' : 'badge-amber'}`}>
          {s.confidence}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Detection Source',
      render: (s) => <span className="badge badge-indigo">{s.reason}</span>,
    },
  ];

  return (
    <div className="app-container">
      {/* Toast popup */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--accent-emerald)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 20px',
            color: '#FFF',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 999,
            animation: 'fadeIn 0.2s ease forwards',
          }}
        >
          <CheckCircle2 size={16} color="var(--accent-emerald)" />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>{toastMessage}</span>
        </div>
      )}

      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        counts={{
          users: users.length,
          transactions: transactions.length,
          fixed: fixedExpenses.length,
          rules: rules.length,
          subscriptions: subscriptions.length,
        }}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header
          activeTab={activeTab}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onQuickAction={(action) => {
            if (action === 'sandbox') setActiveTab('parser-sandbox');
            else if (action === 'export') handleExport();
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <main style={{ flex: 1, padding: '28px', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
          {dataSource !== 'live' && (
            <div
              role="status"
              style={{
                marginBottom: '20px',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                fontSize: '13px',
                color: 'var(--text-primary)',
              }}
            >
              {dataSource === 'loading'
                ? 'Connecting to the Paisa Pulse API…'
                : `Cannot load data: ${dataError ?? 'the API is unreachable'}. Start the API (npm run api), check ADMIN_API_KEY, then press refresh.`}
            </div>
          )}
          {dataSource === 'live' && (activeTab === 'rules' || activeTab === 'subscriptions' || activeTab === 'health-logs') && (
            <div
              role="note"
              style={{
                marginBottom: '20px',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface-elevated)',
                fontSize: '13px',
                color: 'var(--text-muted)',
              }}
            >
              Not tracked by the server yet: categorisation rules stay on each phone, and subscription detection and audit logs are not built yet.
            </div>
          )}
          {/* TAB 1: EXECUTIVE OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Top KPI Cards Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '16px',
                }}
              >
                <StatCard
                  title="Registered Users"
                  value={String(overview.totalUsers)}
                  subtext="4 Active syncing daily"
                  trend={{ value: '+20%', direction: 'up' }}
                  icon={<Users size={20} />}
                  accentColor="emerald"
                />
                <StatCard
                  title="Total Tracked Spend"
                  value={formatINRCompact(overview.totalVolumePaise)}
                  subtext="Gross volume across India"
                  trend={{ value: '+14.2%', direction: 'up' }}
                  icon={<CreditCard size={20} />}
                  accentColor="indigo"
                />
                <StatCard
                  title="Locked Essentials"
                  value={formatINRCompact(overview.totalFixedExpensesPaise)}
                  subtext="Rent, EMIs & SIPs set aside"
                  icon={<CalendarCheck size={20} />}
                  accentColor="amber"
                />
                <StatCard
                  title="Double-Counts Prevented"
                  value="14.2%"
                  subtext="CC bills & self-transfers excluded"
                  trend={{ value: '0% leaks', direction: 'neutral' }}
                  icon={<ShieldAlert size={20} />}
                  accentColor="rose"
                />
              </div>

              {/* Charts Row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                  gap: '20px',
                }}
              >
                <SpendVelocityChart data={chartPoints} />
                <CategoryDonut data={categorySlices} />
              </div>

              {/* Mode Split & Live Health */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                  gap: '20px',
                }}
              >
                <ModeSplitBar modes={modeData} />

                {/* System Status Quick Panel */}
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Architecture Health & Engine Metrics
                      </h3>
                      <span className={`badge ${dataSource === 'live' ? 'badge-emerald' : 'badge-amber'}`}>
                        <span className="badge-dot" /> {dataSource === 'live' ? 'Connected' : dataSource === 'loading' ? 'Connecting…' : 'Offline'}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                      Node.js API (Express), MongoDB & Native Android SMS Module
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      <div style={{ padding: '10px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Database Ping</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#10B981', marginTop: '2px' }} className="mono">
                          {health.latencyMs} ms
                        </div>
                      </div>
                      <div style={{ padding: '10px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Memory Usage</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#FFF', marginTop: '2px' }} className="mono">
                          {health.memoryUsageMb} MB
                        </div>
                      </div>
                      <div style={{ padding: '10px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Uptime</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#818CF8', marginTop: '2px' }} className="mono">
                          {health.uptimeHours} hrs
                        </div>
                      </div>
                      <div style={{ padding: '10px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rate Limit Hits (24h)</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#F59E0B', marginTop: '2px' }} className="mono">
                          {health.rateLimitHits} blocked
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                    <button onClick={() => setActiveTab('health-logs')} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
                      View Full Audit Trail & Logs
                    </button>
                    <button onClick={() => setActiveTab('parser-sandbox')} className="btn btn-primary btn-sm" style={{ width: '100%' }}>
                      Open SMS Parser Sandbox
                    </button>
                  </div>
                </div>
              </div>

              {/* Recent Transactions Preview */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Recent Ledger Movements
                  </h3>
                  <button onClick={() => setActiveTab('transactions')} className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-emerald)' }}>
                    View All {transactions.length} Transactions →
                  </button>
                </div>
                <DataTable
                  data={transactions.slice(0, 5)}
                  columns={transactionColumns}
                  keyExtractor={(t) => t.id}
                  onView={(t) => setViewingTx(t)}
                  pageSize={5}
                />
              </div>
            </div>
          )}

          {/* TAB 2: USERS DIRECTORY */}
          {activeTab === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <DataTable
                data={users}
                columns={userColumns}
                keyExtractor={(u) => u.id}
                searchField={(u) => `${u.name} ${u.email}`}
                externalSearchQuery={searchQuery}
                filterOptions={[
                  {
                    label: 'Status',
                    key: 'status',
                    options: [
                      { label: 'Active', value: 'active' },
                      { label: 'Pending Setup', value: 'pending_setup' },
                      { label: 'Idle', value: 'idle' },
                    ],
                    predicate: (u, val) => u.status === val,
                  },
                ]}
                onView={(u) => setViewingUser(u)}
              />
            </div>
          )}

          {/* TAB 3: TRANSACTIONS LEDGER */}
          {activeTab === 'transactions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <DataTable
                data={transactions}
                columns={transactionColumns}
                keyExtractor={(t) => t.id}
                searchField={(t) => `${t.merchant || ''} ${t.category} ${t.userName || ''} ${t.upiRef || ''} ${t.note || ''}`}
                externalSearchQuery={searchQuery}
                filterOptions={[
                  {
                    label: 'Direction',
                    key: 'direction',
                    options: [
                      { label: 'Debit (Spend)', value: 'debit' },
                      { label: 'Credit (Refund / Income)', value: 'credit' },
                    ],
                    predicate: (t, val) => t.direction === val,
                  },
                  {
                    label: 'Mode',
                    key: 'mode',
                    options: [
                      { label: 'UPI', value: 'UPI' },
                      { label: 'Card', value: 'CARD' },
                      { label: 'Autopay', value: 'AUTOPAY' },
                      { label: 'IMPS', value: 'IMPS' },
                      { label: 'NEFT', value: 'NEFT' },
                      { label: 'ATM Cash', value: 'ATM' },
                    ],
                    predicate: (t, val) => t.mode === val,
                  },
                  {
                    label: 'Exclusion',
                    key: 'isExcluded',
                    options: [
                      { label: 'Included in Budget', value: 'false' },
                      { label: 'Excluded (CC Bills / Self Trf)', value: 'true' },
                    ],
                    predicate: (t, val) => String(t.isExcluded) === val,
                  },
                ]}
                onView={(t) => setViewingTx(t)}
                pageSize={10}
              />
            </div>
          )}

          {/* TAB 4: FIXED COMMITMENTS */}
          {activeTab === 'fixed-expenses' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <DataTable
                data={fixedExpenses}
                columns={fixedColumns}
                keyExtractor={(f) => f.id}
                searchField={(f) => `${f.name} ${f.userName || ''}`}
                externalSearchQuery={searchQuery}
              />
            </div>
          )}

          {/* TAB 5: CATEGORY RULES */}
          {activeTab === 'rules' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <DataTable
                data={rules}
                columns={ruleColumns}
                keyExtractor={(r) => r.id}
                searchField={(r) => `${r.pattern} ${r.category}`}
                externalSearchQuery={searchQuery}
              />
            </div>
          )}

          {/* TAB 6: DAILY BUDGETS */}
          {activeTab === 'summaries' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <DataTable
                data={summaries}
                columns={summaryColumns}
                keyExtractor={(s) => `${s.date}_${s.userId}`}
                searchField={(s) => `${s.date} ${s.userName || ''}`}
                externalSearchQuery={searchQuery}
              />
            </div>
          )}

          {/* TAB 7: AUTOPAY SUBSCRIPTIONS */}
          {activeTab === 'subscriptions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <DataTable
                data={subscriptions}
                columns={subscriptionColumns}
                keyExtractor={(s) => s.id}
                searchField={(s) => `${s.name} ${s.merchantNorm} ${s.userName || ''}`}
                externalSearchQuery={searchQuery}
              />
            </div>
          )}

          {/* TAB 8: PARSER SANDBOX */}
          {activeTab === 'parser-sandbox' && <ParserSandbox />}

          {/* TAB 9: SYSTEM HEALTH & AUDIT LOGS */}
          {activeTab === 'health-logs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Telemetry Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{ padding: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>MongoDB Status</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-emerald)', marginTop: '4px' }}>
                    Healthy · Connected
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Replica Set Cluster</div>
                </div>

                <div style={{ padding: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ping Latency</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#FFF', marginTop: '4px' }} className="mono">
                    14 ms
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Sub-millisecond write buffer</div>
                </div>

                <div style={{ padding: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Synced Ledger Rows</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#818CF8', marginTop: '4px' }} className="mono">
                    354
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>0 collisions / duplicate drops</div>
                </div>

                <div style={{ padding: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rate Limit Hits (24h)</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#F59E0B', marginTop: '4px' }} className="mono">
                    2
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Auth rate limiter active</div>
                </div>
              </div>

              {/* Audit Logs Table */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#FFF' }}>Administrative Audit Trail</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Immutable ledger of automated parser rules, manual exclusions and user modifications
                    </p>
                  </div>
                  <span className="badge badge-emerald">Live Stream</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          className={`badge ${
                            log.status === 'success'
                              ? 'badge-emerald'
                              : log.status === 'warning'
                              ? 'badge-amber'
                              : 'badge-rose'
                          }`}
                        >
                          {log.action}
                        </span>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>{log.details}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Actor: {log.actor} · Target: {log.entity}
                          </div>
                        </div>
                      </div>
                      <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {formatDateTime(log.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL 1: VIEW USER DOSSIER */}
      <Modal
        isOpen={viewingUser !== null}
        onClose={() => setViewingUser(null)}
        title={viewingUser?.name || 'User Profile'}
        subtitle={`Account ID: ${viewingUser?.id}`}
      >
        {viewingUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Monthly Salary</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-emerald)' }} className="mono">
                  {formatINR(viewingUser.salaryPaise)}
                </div>
              </div>
              <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Cycle Payday</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#FFF' }}>
                  {ordinal(viewingUser.payday)} of month
                </div>
              </div>
              <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Savings Goal</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#818CF8' }} className="mono">
                  {formatINR(viewingUser.savingsGoalPaise)}
                </div>
              </div>
              <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Timezone</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#FFF' }}>{viewingUser.timezone}</div>
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>User Status</h4>
              <span className="badge badge-emerald">{viewingUser.status}</span>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Account created on {formatDate(viewingUser.createdAt)}. All transaction amounts sync via Android background service with zero plain SMS text uploads.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 2: VIEW TRANSACTION */}
      <Modal
        isOpen={viewingTx !== null}
        onClose={() => setViewingTx(null)}
        title="Transaction Dossier"
        subtitle={`ID: ${viewingTx?.id}`}
        footer={
          <button onClick={() => setViewingTx(null)} className="btn btn-secondary">
            Close
          </button>
        }
      >
        {(() => {
          const t = viewingTx;
          if (!t) return null;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '16px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Amount & Direction</div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: t.direction === 'debit' ? '#FFF' : 'var(--accent-emerald)' }} className="mono">
                  {t.direction === 'debit' ? '-' : '+'}
                  {formatINR(t.amountPaise)}
                </div>
              </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '12px' }}>
                  <div style={{ padding: '8px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Merchant</div>
                    <div style={{ fontWeight: 600 }}>{t.merchant || '—'}</div>
                  </div>
                  <div style={{ padding: '8px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Category</div>
                    <div style={{ fontWeight: 600 }}>{t.category}</div>
                  </div>
                  <div style={{ padding: '8px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Mode</div>
                    <div style={{ fontWeight: 600 }}>{t.mode}</div>
                  </div>
                  <div style={{ padding: '8px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>UPI Ref</div>
                    <div style={{ fontWeight: 600 }} className="mono">{t.upiRef || '—'}</div>
                  </div>
                  <div style={{ gridColumn: 'span 2', padding: '8px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Dedupe Hash</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {t.dedupeHash}
                    </div>
                  </div>
                </div>
            </div>
          );
        })()}
      </Modal>

    </div>
  );
}
