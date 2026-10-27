'use client';

import React from 'react';
import type { TabType } from '../lib/types';
import {
  LayoutDashboard,
  Users,
  ReceiptText,
  CalendarCheck2,
  SlidersHorizontal,
  CalendarDays,
  Repeat,
  Terminal,
  Activity,
  ChevronRight,
  ShieldCheck,
  X,
} from 'lucide-react';

interface SidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  counts: {
    users: number;
    transactions: number;
    fixed: number;
    rules: number;
    subscriptions: number;
  };
}

export function Sidebar({
  activeTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  counts,
}: SidebarProps) {
  const navItems: { id: TabType; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Executive Pulse', icon: <LayoutDashboard size={18} /> },
    { id: 'users', label: 'User Directory', icon: <Users size={18} />, badge: counts.users },
    { id: 'transactions', label: 'Transactions Ledger', icon: <ReceiptText size={18} />, badge: counts.transactions },
    { id: 'fixed-expenses', label: 'Fixed Commitments', icon: <CalendarCheck2 size={18} />, badge: counts.fixed },
    { id: 'rules', label: 'Category Rules', icon: <SlidersHorizontal size={18} />, badge: counts.rules },
    { id: 'summaries', label: 'Daily Budgets', icon: <CalendarDays size={18} /> },
    { id: 'subscriptions', label: 'AutoPay Mandates', icon: <Repeat size={18} />, badge: counts.subscriptions },
    { id: 'parser-sandbox', label: 'SMS Parser Sandbox', icon: <Terminal size={18} /> },
    { id: 'health-logs', label: 'System Health & Logs', icon: <Activity size={18} /> },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 40,
          }}
        />
      )}

      <aside
        style={{
          width: '280px',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          transition: 'transform 0.3s ease',
          ...(isOpenMobile
            ? { position: 'fixed', left: 0, top: 0, transform: 'translateX(0)' }
            : {}),
        }}
        className="admin-sidebar"
      >
        {/* Brand Header */}
        <div
          style={{
            padding: '24px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px rgba(16, 185, 129, 0.35)',
              }}
            >
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#041F14' }}>₹</span>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '-0.02em', color: '#F8F9FA' }}>
                PAISA PULSE
              </div>
              <div style={{ fontSize: '11px', color: 'var(--accent-emerald)', fontWeight: 600, letterSpacing: '0.05em' }}>
                ADMIN CONSOLE
              </div>
            </div>
          </div>

          {isOpenMobile && (
            <button
              onClick={onCloseMobile}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation Section */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '8px 12px 4px',
            }}
          >
            Core Operations
          </div>

          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  if (isOpenMobile) onCloseMobile();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
                  color: isActive ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                  border: isActive ? '1px solid var(--border-medium)' : '1px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'all 0.15s ease',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                <span style={{ color: isActive ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    style={{
                      background: isActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                      color: isActive ? 'var(--accent-emerald)' : 'var(--text-muted)',
                      padding: '2px 7px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
                {isActive && <ChevronRight size={14} color="var(--accent-emerald)" />}
              </button>
            );
          })}
        </div>

        {/* Footer System Status */}
        <div
          style={{
            padding: '16px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px',
              background: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--accent-emerald)',
                boxShadow: '0 0 8px var(--accent-emerald)',
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                API & MongoDB Active
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                v1.0.4 · 14ms latency
              </div>
            </div>
            <ShieldCheck size={16} color="var(--accent-emerald)" />
          </div>
        </div>
      </aside>
    </>
  );
}
