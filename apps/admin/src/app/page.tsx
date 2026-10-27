'use client';

import React, { useState, useMemo } from 'react';
import type {
  AdminDailySummary,
  AdminFixedExpense,
  AdminSubscription,
  AdminTransaction,
  AdminUser,
  AdminUserRule,
  TabType,
} from '../lib/types';
import {
  INITIAL_USERS,
  INITIAL_TRANSACTIONS,
  INITIAL_FIXED_EXPENSES,
  INITIAL_RULES,
  INITIAL_SUMMARIES,
  INITIAL_SUBSCRIPTIONS,
  SYSTEM_HEALTH,
  OVERVIEW_STATS,
  AUDIT_LOGS,
} from '../lib/mockData';
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
  PiggyBank,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowUpRight,
  TrendingDown,
  Repeat,
  Sparkles,
  Info,
} from 'lucide-react';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Core Data States
  const [users, setUsers] = useState<AdminUser[]>(INITIAL_USERS);
  const [transactions, setTransactions] = useState<AdminTransaction[]>(INITIAL_TRANSACTIONS);
  const [fixedExpenses, setFixedExpenses] = useState<AdminFixedExpense[]>(INITIAL_FIXED_EXPENSES);
  const [rules, setRules] = useState<AdminUserRule[]>(INITIAL_RULES);
  const [summaries, setSummaries] = useState<AdminDailySummary[]>(INITIAL_SUMMARIES);
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>(INITIAL_SUBSCRIPTIONS);
  const [logs, setLogs] = useState(AUDIT_LOGS);

  // Modals
  const [viewingUser, setViewingUser] = useState<AdminUser | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [viewingTx, setViewingTx] = useState<AdminTransaction | null>(null);
  const [editingTx, setEditingTx] = useState<AdminTransaction | null>(null);
  const [isAddingTx, setIsAddingTx] = useState(false);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [isAddingFixed, setIsAddingFixed] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      showToast('Database records synced with .NET API');
    }, 600);
  };

  // Form states
  const [newTxForm, setNewTxForm] = useState({
    userId: users[0]?.id ?? 'usr_arjun_01',
    amountRupees: 500,
    direction: 'debit' as 'debit' | 'credit',
    merchant: '',
    category: 'food',
    mode: 'UPI' as 'UPI' | 'CARD' | 'ATM' | 'IMPS' | 'NEFT' | 'AUTOPAY' | 'OTHER',
    note: '',
    isExcluded: false,
  });

  const [newRuleForm, setNewRuleForm] = useState({
    pattern: '',
    category: 'groceries',
  });

  const [newFixedForm, setNewFixedForm] = useState({
    userId: users[0]?.id ?? 'usr_arjun_01',
    name: '',
    amountRupees: 5000,
    dueDay: 5,
    category: 'rent_emi',
  });

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

  // Dynamic Chart Points
  const chartPoints = useMemo(() => {
    return [
      { day: '21 Oct', amountPaise: 8_200_00, count: 18 },
      { day: '22 Oct', amountPaise: 14_500_00, count: 24 },
      { day: '23 Oct', amountPaise: 11_300_00, count: 19 },
      { day: '24 Oct', amountPaise: 29_400_00, count: 42 },
      { day: '25 Oct', amountPaise: 18_100_00, count: 31 },
      { day: '26 Oct', amountPaise: 24_800_00, count: 36 },
      { day: '27 Oct', amountPaise: OVERVIEW_STATS.todayVolumePaise, count: 28 },
    ];
  }, []);

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
            if (action === 'add_tx') setIsAddingTx(true);
            else if (action === 'add_rule') setIsAddingRule(true);
            else if (action === 'add_fixed') setIsAddingFixed(true);
            else if (action === 'sandbox') setActiveTab('parser-sandbox');
            else if (action === 'export') handleExport();
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <main style={{ flex: 1, padding: '28px', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
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
                  value={String(OVERVIEW_STATS.totalUsers)}
                  subtext="4 Active syncing daily"
                  trend={{ value: '+20%', direction: 'up' }}
                  icon={<Users size={20} />}
                  accentColor="emerald"
                />
                <StatCard
                  title="Total Tracked Spend"
                  value={formatINRCompact(OVERVIEW_STATS.totalVolumePaise)}
                  subtext="Gross volume across India"
                  trend={{ value: '+14.2%', direction: 'up' }}
                  icon={<CreditCard size={20} />}
                  accentColor="indigo"
                />
                <StatCard
                  title="Locked Essentials"
                  value={formatINRCompact(OVERVIEW_STATS.totalFixedExpensesPaise)}
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
                      <span className="badge badge-emerald">
                        <span className="badge-dot" /> Connected
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                      .NET 10 API, MongoDB Replica Set & Native Android SMS Module
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      <div style={{ padding: '10px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Database Ping</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#10B981', marginTop: '2px' }} className="mono">
                          {SYSTEM_HEALTH.latencyMs} ms
                        </div>
                      </div>
                      <div style={{ padding: '10px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Memory Usage</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#FFF', marginTop: '2px' }} className="mono">
                          {SYSTEM_HEALTH.memoryUsageMb} MB
                        </div>
                      </div>
                      <div style={{ padding: '10px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Uptime</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#818CF8', marginTop: '2px' }} className="mono">
                          {SYSTEM_HEALTH.uptimeHours} hrs
                        </div>
                      </div>
                      <div style={{ padding: '10px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rate Limit Hits (24h)</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#F59E0B', marginTop: '2px' }} className="mono">
                          {SYSTEM_HEALTH.rateLimitHits} blocked
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
                  onEdit={(t) => setEditingTx(t)}
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
                onEdit={(u) => setEditingUser(u)}
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
                onEdit={(t) => setEditingTx(t)}
                onDelete={(t) => {
                  setTransactions((prev) => prev.filter((x) => x.id !== t.id));
                  showToast(`Transaction ${t.id} deleted`);
                }}
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
                onDelete={(f) => {
                  setFixedExpenses((prev) => prev.filter((x) => x.id !== f.id));
                  showToast(`Fixed expense "${f.name}" removed`);
                }}
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
                onDelete={(r) => {
                  setRules((prev) => prev.filter((x) => x.id !== r.id));
                  showToast(`Rule "${r.pattern}" deleted`);
                }}
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
                onEdit={(s) => {
                  // Promote to fixed commitment
                  setFixedExpenses((prev) => [
                    ...prev,
                    {
                      id: `fix_promoted_${Date.now()}`,
                      userId: s.userId,
                      userName: s.userName,
                      name: s.name,
                      amountPaise: s.amountPaise,
                      dueDay: s.dueDay,
                      createdAt: Date.now(),
                      frequency: 'Monthly',
                      category: 'subscriptions',
                    },
                  ]);
                  showToast(`Promoted "${s.name}" to Fixed Commitments`);
                }}
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

      {/* MODAL 2: EDIT USER */}
      <Modal
        isOpen={editingUser !== null}
        onClose={() => setEditingUser(null)}
        title="Edit User Financial Profile"
        subtitle={`Editing ${editingUser?.name}`}
        footer={
          <>
            <button onClick={() => setEditingUser(null)} className="btn btn-ghost">
              Cancel
            </button>
            <button
              onClick={() => {
                if (editingUser) {
                  setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? editingUser : u)));
                  showToast(`Updated profile for ${editingUser.name}`);
                  setEditingUser(null);
                }
              }}
              className="btn btn-primary"
            >
              Save Profile
            </button>
          </>
        }
      >
        {editingUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                Full Name
              </label>
              <input
                type="text"
                value={editingUser.name}
                onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                className="input-text"
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                Monthly Take-Home Salary (₹)
              </label>
              <input
                type="number"
                value={editingUser.salaryPaise / 100}
                onChange={(e) => setEditingUser({ ...editingUser, salaryPaise: Math.round(Number(e.target.value) * 100) })}
                className="input-text"
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                Payday (1–31)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={editingUser.payday}
                onChange={(e) => setEditingUser({ ...editingUser, payday: Number(e.target.value) })}
                className="input-text"
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                Monthly Savings Goal (₹)
              </label>
              <input
                type="number"
                value={editingUser.savingsGoalPaise / 100}
                onChange={(e) =>
                  setEditingUser({ ...editingUser, savingsGoalPaise: Math.round(Number(e.target.value) * 100) })
                }
                className="input-text"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 3: VIEW / EDIT TRANSACTION */}
      <Modal
        isOpen={viewingTx !== null || editingTx !== null}
        onClose={() => {
          setViewingTx(null);
          setEditingTx(null);
        }}
        title={editingTx ? 'Edit Transaction Details' : 'Transaction Dossier'}
        subtitle={`ID: ${(editingTx || viewingTx)?.id}`}
        footer={
          editingTx ? (
            <>
              <button onClick={() => setEditingTx(null)} className="btn btn-ghost">
                Cancel
              </button>
              <button
                onClick={() => {
                  setTransactions((prev) => prev.map((t) => (t.id === editingTx.id ? editingTx : t)));
                  showToast('Transaction updated');
                  setEditingTx(null);
                }}
                className="btn btn-primary"
              >
                Save Changes
              </button>
            </>
          ) : (
            <button onClick={() => setViewingTx(null)} className="btn btn-secondary">
              Close
            </button>
          )
        }
      >
        {(() => {
          const t = editingTx || viewingTx;
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

              {editingTx ? (
                <>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                      Category
                    </label>
                    <select
                      value={editingTx.category}
                      onChange={(e) => setEditingTx({ ...editingTx, category: e.target.value })}
                      className="select-input"
                    >
                      {Object.entries(CATEGORY_META).map(([key, meta]) => (
                        <option key={key} value={key}>
                          {meta.emoji} {meta.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                      Note / Description
                    </label>
                    <input
                      type="text"
                      value={editingTx.note || ''}
                      onChange={(e) => setEditingTx({ ...editingTx, note: e.target.value })}
                      className="input-text"
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                    <input
                      type="checkbox"
                      id="exclude-check"
                      checked={editingTx.isExcluded}
                      onChange={(e) => setEditingTx({ ...editingTx, isExcluded: e.target.checked })}
                    />
                    <label htmlFor="exclude-check" style={{ fontSize: '13px', color: '#FFF', cursor: 'pointer' }}>
                      Exclude from spend maths ("Not an expense" / CC Bill / Self Transfer)
                    </label>
                  </div>
                </>
              ) : (
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
              )}
            </div>
          );
        })()}
      </Modal>

      {/* MODAL 4: ADD MANUAL TRANSACTION */}
      <Modal
        isOpen={isAddingTx}
        onClose={() => setIsAddingTx(false)}
        title="Add New Transaction"
        subtitle="Manual entry ledger credit or debit"
        footer={
          <>
            <button onClick={() => setIsAddingTx(false)} className="btn btn-ghost">
              Cancel
            </button>
            <button
              onClick={() => {
                const user = users.find((u) => u.id === newTxForm.userId);
                const tx: AdminTransaction = {
                  id: `tx_${Date.now()}`,
                  userId: newTxForm.userId,
                  userName: user?.name,
                  amountPaise: Math.round(newTxForm.amountRupees * 100),
                  direction: newTxForm.direction,
                  merchant: newTxForm.merchant || 'Manual Entry',
                  merchantNorm: (newTxForm.merchant || 'manual').toLowerCase().replace(/\s+/g, '_'),
                  vpa: null,
                  mode: newTxForm.mode,
                  accountLast4: null,
                  upiRef: null,
                  balancePaise: null,
                  category: newTxForm.category,
                  needsReview: false,
                  note: newTxForm.note || null,
                  source: 'manual',
                  occurredAt: Date.now(),
                  dedupeHash: `manual_${Date.now()}`,
                  isExcluded: newTxForm.isExcluded,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                };
                setTransactions((prev) => [tx, ...prev]);
                showToast('Transaction created');
                setIsAddingTx(false);
              }}
              className="btn btn-primary"
            >
              Add Transaction
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              User Account
            </label>
            <select
              value={newTxForm.userId}
              onChange={(e) => setNewTxForm({ ...newTxForm, userId: e.target.value })}
              className="select-input"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              Amount in Rupees (₹)
            </label>
            <input
              type="number"
              value={newTxForm.amountRupees}
              onChange={(e) => setNewTxForm({ ...newTxForm, amountRupees: Number(e.target.value) })}
              className="input-text"
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              Merchant / Store
            </label>
            <input
              type="text"
              placeholder="e.g. Starbucks, Amazon, Zomato"
              value={newTxForm.merchant}
              onChange={(e) => setNewTxForm({ ...newTxForm, merchant: e.target.value })}
              className="input-text"
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              Category
            </label>
            <select
              value={newTxForm.category}
              onChange={(e) => setNewTxForm({ ...newTxForm, category: e.target.value })}
              className="select-input"
            >
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.emoji} {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              Payment Channel
            </label>
            <select
              value={newTxForm.mode}
              onChange={(e) => setNewTxForm({ ...newTxForm, mode: e.target.value as any })}
              className="select-input"
            >
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="AUTOPAY">Autopay Mandate</option>
              <option value="IMPS">IMPS</option>
              <option value="NEFT">NEFT</option>
              <option value="ATM">ATM Cash</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="new-tx-excluded"
              checked={newTxForm.isExcluded}
              onChange={(e) => setNewTxForm({ ...newTxForm, isExcluded: e.target.checked })}
            />
            <label htmlFor="new-tx-excluded" style={{ fontSize: '12px', color: '#FFF' }}>
              Exclude from daily spending allowance
            </label>
          </div>
        </div>
      </Modal>

      {/* MODAL 5: ADD NEW RULE */}
      <Modal
        isOpen={isAddingRule}
        onClose={() => setIsAddingRule(false)}
        title="Create Categorization Rule"
        subtitle="Map merchant strings automatically"
        footer={
          <>
            <button onClick={() => setIsAddingRule(false)} className="btn btn-ghost">
              Cancel
            </button>
            <button
              onClick={() => {
                if (!newRuleForm.pattern.trim()) return;
                const r: AdminUserRule = {
                  id: `rul_${Date.now()}`,
                  pattern: newRuleForm.pattern.toLowerCase().trim(),
                  category: newRuleForm.category,
                  matchCount: 0,
                  createdAt: Date.now(),
                };
                setRules((prev) => [r, ...prev]);
                showToast(`Rule for "${r.pattern}" created`);
                setIsAddingRule(false);
                setNewRuleForm({ pattern: '', category: 'groceries' });
              }}
              className="btn btn-primary"
            >
              Save Rule
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              Pattern (lowercase substring match)
            </label>
            <input
              type="text"
              placeholder="e.g. netflix, swiggy, cult"
              value={newRuleForm.pattern}
              onChange={(e) => setNewRuleForm({ ...newRuleForm, pattern: e.target.value })}
              className="input-text"
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              Target Category
            </label>
            <select
              value={newRuleForm.category}
              onChange={(e) => setNewRuleForm({ ...newRuleForm, category: e.target.value })}
              className="select-input"
            >
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.emoji} {meta.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* MODAL 6: ADD NEW FIXED EXPENSE */}
      <Modal
        isOpen={isAddingFixed}
        onClose={() => setIsAddingFixed(false)}
        title="Add Fixed Commitment"
        subtitle="Lock an essential expense in advance"
        footer={
          <>
            <button onClick={() => setIsAddingFixed(false)} className="btn btn-ghost">
              Cancel
            </button>
            <button
              onClick={() => {
                if (!newFixedForm.name.trim()) return;
                const user = users.find((u) => u.id === newFixedForm.userId);
                const item: AdminFixedExpense = {
                  id: `fix_${Date.now()}`,
                  userId: newFixedForm.userId,
                  userName: user?.name,
                  name: newFixedForm.name.trim(),
                  amountPaise: Math.round(newFixedForm.amountRupees * 100),
                  dueDay: newFixedForm.dueDay,
                  createdAt: Date.now(),
                  frequency: 'Monthly',
                  category: newFixedForm.category,
                };
                setFixedExpenses((prev) => [item, ...prev]);
                showToast(`Fixed expense "${item.name}" added`);
                setIsAddingFixed(false);
              }}
              className="btn btn-primary"
            >
              Save Commitment
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              User
            </label>
            <select
              value={newFixedForm.userId}
              onChange={(e) => setNewFixedForm({ ...newFixedForm, userId: e.target.value })}
              className="select-input"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              Commitment Name
            </label>
            <input
              type="text"
              placeholder="e.g. Home Rent, Car Loan EMI, SIP"
              value={newFixedForm.name}
              onChange={(e) => setNewFixedForm({ ...newFixedForm, name: e.target.value })}
              className="input-text"
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              Monthly Amount (₹)
            </label>
            <input
              type="number"
              value={newFixedForm.amountRupees}
              onChange={(e) => setNewFixedForm({ ...newFixedForm, amountRupees: Number(e.target.value) })}
              className="input-text"
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              Due Day of the Month (1–31)
            </label>
            <input
              type="number"
              min={1}
              max={31}
              value={newFixedForm.dueDay}
              onChange={(e) => setNewFixedForm({ ...newFixedForm, dueDay: Number(e.target.value) })}
              className="input-text"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
