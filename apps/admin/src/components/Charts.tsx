'use client';

import React, { useState } from 'react';
import { CATEGORY_META, formatINR } from '../lib/formatters';

interface DailyPoint {
  day: string;
  amountPaise: number;
  count: number;
}

export function SpendVelocityChart({ data }: { data: DailyPoint[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxVal = Math.max(...data.map((d) => d.amountPaise), 10_000_00);
  const width = 600;
  const height = 180;
  const paddingX = 40;
  const paddingY = 24;

  const points = data.map((d, i) => {
    const x = paddingX + (i / (data.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - (d.amountPaise / maxVal) * (height - paddingY * 2);
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');
  const areaD = `${pathD} L ${points[points.length - 1]?.x ?? 0} ${height - paddingY} L ${points[0]?.x ?? 0} ${height - paddingY} Z`;

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Daily Spend Volume Velocity
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Aggregated spend across all users for the last 7 calendar days
          </p>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--accent-emerald)', fontWeight: 600 }}>
          Live Telemetry
        </div>
      </div>

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', maxHeight: '200px' }}>
          <defs>
            <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
          <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="rgba(255,255,255,0.1)" />

          {/* Area */}
          <path d={areaD} fill="url(#emeraldGradient)" />

          {/* Line */}
          <path d={pathD} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Points */}
          {points.map((p, i) => (
            <g key={p.day}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredIdx === i ? 6 : 4}
                fill="#0B0D11"
                stroke="#10B981"
                strokeWidth={hoveredIdx === i ? 3 : 2}
                style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
              <text
                x={p.x}
                y={height - 6}
                textAnchor="middle"
                fontSize="10"
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
              >
                {p.day}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {hoveredIdx !== null && points[hoveredIdx] && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px 12px',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>
            Date: <strong style={{ color: '#FFF' }}>{points[hoveredIdx].day}</strong>
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Transactions: <strong style={{ color: '#FFF' }}>{points[hoveredIdx].count}</strong>
          </span>
          <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }} className="mono">
            {formatINR(points[hoveredIdx].amountPaise)}
          </span>
        </div>
      )}
    </div>
  );
}

interface CategorySlice {
  category: string;
  amountPaise: number;
}

export function CategoryDonut({ data }: { data: CategorySlice[] }) {
  const total = data.reduce((sum, d) => sum + d.amountPaise, 0) || 1;
  const slices = data.map((d, i) => {
    const fraction = d.amountPaise / total;
    const angle = fraction * 360;
    const startAngle = data.slice(0, i).reduce((sum, prev) => sum + (prev.amountPaise / total) * 360, 0);
    return {
      ...d,
      fraction,
      startAngle,
      angle,
      color: CATEGORY_META[d.category]?.color || '#94A3B8',
      label: CATEGORY_META[d.category]?.label || d.category,
      emoji: CATEGORY_META[d.category]?.emoji || '🏷️',
    };
  });

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
      }}
    >
      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
        Spending by Category
      </h3>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Essential vs discretionary distribution
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ width: '130px', height: '130px', position: 'relative' }}>
          <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
            {slices.map((s) => {
              const strokeDasharray = `${(s.angle / 360) * 251.2} 251.2`;
              const strokeDashoffset = -((s.startAngle / 360) * 251.2);
              return (
                <circle
                  key={s.category}
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke={s.color}
                  strokeWidth="14"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                />
              );
            })}
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFF' }} className="mono">
              {formatINR(total)}
            </span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {slices.slice(0, 5).map((s) => (
            <div
              key={s.category}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: s.color,
                  }}
                />
                <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
              </div>
              <span className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {Math.round(s.fraction * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ModeSplitBar({ modes }: { modes: { mode: string; count: number; percentage: number }[] }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
      }}
    >
      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
        Payment Instrument Breakdown
      </h3>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        UPI dominance vs Cards, Net Banking & AutoPay Mandates
      </p>

      {/* Horizontal stacked bar */}
      <div
        style={{
          display: 'flex',
          height: '12px',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          marginBottom: '16px',
        }}
      >
        {modes.map((m) => {
          const colors: Record<string, string> = {
            UPI: '#10B981',
            CARD: '#6366F1',
            AUTOPAY: '#8B5CF6',
            IMPS: '#06B6D4',
            NEFT: '#F59E0B',
            ATM: '#64748B',
            OTHER: '#334155',
          };
          return (
            <div
              key={m.mode}
              style={{
                width: `${m.percentage}%`,
                background: colors[m.mode] || '#94A3B8',
                transition: 'width 0.3s ease',
              }}
              title={`${m.mode}: ${m.percentage}%`}
            />
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
        {modes.map((m) => (
          <div
            key={m.mode}
            style={{
              padding: '8px',
              background: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{m.mode}</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }} className="mono">
              {m.percentage}%
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{m.count} txs</div>
          </div>
        ))}
      </div>
    </div>
  );
}
