'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  subtext?: string;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  icon?: React.ReactNode;
  accentColor?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'cyan';
  progress?: {
    current: number;
    total: number;
    label?: string;
  };
}

export function StatCard({
  title,
  value,
  subtext,
  trend,
  icon,
  accentColor = 'emerald',
  progress,
}: StatCardProps) {
  const colorMap = {
    emerald: {
      bg: 'rgba(16, 185, 129, 0.1)',
      border: 'rgba(16, 185, 129, 0.25)',
      text: '#10B981',
      bar: '#10B981',
    },
    indigo: {
      bg: 'rgba(99, 102, 241, 0.1)',
      border: 'rgba(99, 102, 241, 0.25)',
      text: '#818CF8',
      bar: '#6366F1',
    },
    amber: {
      bg: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.25)',
      text: '#FBBF24',
      bar: '#F59E0B',
    },
    rose: {
      bg: 'rgba(244, 63, 94, 0.1)',
      border: 'rgba(244, 63, 94, 0.25)',
      text: '#FB7185',
      bar: '#F43F5E',
    },
    cyan: {
      bg: 'rgba(6, 182, 212, 0.1)',
      border: 'rgba(6, 182, 212, 0.25)',
      text: '#22D3EE',
      bar: '#06B6D4',
    },
  }[accentColor];

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        transition: 'all 0.2s ease',
      }}
      className="stat-card"
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {title}
          </span>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px', letterSpacing: '-0.02em' }} className="mono">
            {value}
          </div>
        </div>

        {icon && (
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md)',
              background: colorMap.bg,
              border: `1px solid ${colorMap.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colorMap.text,
            }}
          >
            {icon}
          </div>
        )}
      </div>

      {/* Progress Bar (Optional) */}
      {progress && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>
            <span>{progress.label || 'Progress'}</span>
            <span className="mono">
              {Math.round((progress.current / (progress.total || 1)) * 100)}%
            </span>
          </div>
          <div
            style={{
              height: '6px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(255, 255, 255, 0.06)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (progress.current / (progress.total || 1)) * 100)}%`,
                height: '100%',
                background: colorMap.bar,
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Bottom trend info */}
      {(trend || subtext) && (
        <div
          style={{
            marginTop: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
          }}
        >
          {trend && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600,
                color:
                  trend.direction === 'up'
                    ? 'var(--accent-emerald)'
                    : trend.direction === 'down'
                    ? 'var(--accent-rose)'
                    : 'var(--text-muted)',
              }}
            >
              {trend.direction === 'up' ? (
                <TrendingUp size={14} />
              ) : trend.direction === 'down' ? (
                <TrendingDown size={14} />
              ) : (
                <Minus size={14} />
              )}
              {trend.value}
            </span>
          )}

          {subtext && <span style={{ color: 'var(--text-muted)' }}>{subtext}</span>}
        </div>
      )}
    </div>
  );
}
