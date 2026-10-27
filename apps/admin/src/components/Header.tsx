'use client';

import React from 'react';
import type { TabType } from '../lib/types';
import {
  Menu,
  Search,
  RefreshCw,
  Download,
  Terminal,
} from 'lucide-react';

interface HeaderProps {
  activeTab: TabType;
  onOpenMobileSidebar: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onQuickAction: (action: 'sandbox' | 'export') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const TAB_TITLES: Record<TabType, { title: string; subtitle: string }> = {
  overview: {
    title: 'Executive Pulse & Architecture Overview',
    subtitle: 'System performance, user financials, tracked volume, and money velocity across India',
  },
  users: {
    title: 'Registered Users Directory',
    subtitle: 'Profile configs, monthly take-home salary, custom paydays, and savings goals',
  },
  transactions: {
    title: 'Master Transactions Ledger',
    subtitle: 'Multi-bank SMS, UPI references, CC bill auto-exclusions, and net spend calculations',
  },
  'fixed-expenses': {
    title: 'Fixed Commitments & Essentials',
    subtitle: 'Locked monthly commitments (rent, EMIs, SIPs) protected from daily budget erosion',
  },
  rules: {
    title: 'Intelligent Categorization Rules',
    subtitle: 'Machine-learning keyword heuristics mapping merchants to essential/discretionary categories',
  },
  summaries: {
    title: 'Daily Budget Cycles & Summaries',
    subtitle: 'Calm daily allowances, on-budget streaks, and cycle progression for all users',
  },
  subscriptions: {
    title: 'AutoPay Mandates & Subscriptions',
    subtitle: 'Automated detection of recurring monthly debits (Netflix, SIPs, loan EMIs)',
  },
  'parser-sandbox': {
    title: 'Live Bank SMS & Notification Parser Simulator',
    subtitle: 'Test and debug real Indian bank SMS bodies, regexes, and exclusion rules in real time',
  },
  'health-logs': {
    title: 'System Health, MongoDB Metrics & Audit Logs',
    subtitle: 'Real-time API latency, background jobs, deduplication telemetry, and audit trail',
  },
};

export function Header({
  activeTab,
  onOpenMobileSidebar,
  onRefresh,
  isRefreshing,
  onQuickAction,
  searchQuery,
  onSearchChange,
}: HeaderProps) {
  const current = TAB_TITLES[activeTab] || { title: 'Admin Console', subtitle: 'Paisa Pulse' };

  return (
    <header
      style={{
        padding: '16px 28px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(11, 13, 17, 0.85)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
      }}
    >
      {/* Title & Mobile Hamburger */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={onOpenMobileSidebar}
          className="btn btn-ghost btn-sm"
          style={{ display: 'none', padding: '6px' }}
          id="mobile-menu-btn"
          aria-label="Open sidebar menu"
        >
          <Menu size={20} />
        </button>

        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {current.title}
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {current.subtitle}
          </p>
        </div>
      </div>

      {/* Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Global Search Bar */}
        <div style={{ position: 'relative', width: '220px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            placeholder="Search records..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input-text"
            style={{ paddingLeft: '32px', height: '34px', fontSize: '12px' }}
          />
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="btn btn-secondary btn-sm"
          title="Refresh dataset from API"
        >
          <RefreshCw size={14} className={isRefreshing ? 'spin-icon' : ''} />
          <span>Sync</span>
        </button>

        {/* Quick Simulator Button */}
        <button
          onClick={() => onQuickAction('sandbox')}
          className="btn btn-secondary btn-sm"
          style={{ borderColor: 'rgba(99, 102, 241, 0.4)', color: '#A5B4FC' }}
        >
          <Terminal size={14} />
          <span>Parser Tester</span>
        </button>

        {/* Export Button */}
        <button
          onClick={() => onQuickAction('export')}
          className="btn btn-secondary btn-sm"
          title="Export current table to CSV"
        >
          <Download size={14} />
        </button>

        {/* User Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 10px',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-full)',
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 700,
              color: '#FFF',
            }}
          >
            AD
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>Super Admin</span>
        </div>
      </div>
    </header>
  );
}
