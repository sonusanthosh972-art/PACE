'use client';

import React, { useState } from 'react';
import { simulateParse, type ParsedSimResult } from '../lib/parserClient';
import { formatINR } from '../lib/formatters';
import {
  Terminal,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';

const PRESETS: { label: string; text: string }[] = [
  {
    label: 'HDFC UPI Debit',
    text: 'Sent Rs.340.00 From HDFC Bank A/C *4321 To THIRD WAVE COFFEE On 24/10/26 Ref 429812345678 Not You? Call 18002586161',
  },
  {
    label: 'CRED CC Bill (Auto-Excluded)',
    text: 'INR 18,450.00 debited from A/c XX4321 on 24-10-26 towards CRED CC PAYMENT. Ref 429812345699.',
  },
  {
    label: 'Self Transfer (Auto-Excluded)',
    text: 'Rs.25,000.00 debited from HDFC Bank A/c XX4321 on 24-10-26 to self transfer a/c XX1104. Ref 629812345004.',
  },
  {
    label: 'Amazon Card Refund',
    text: 'Rs.1,299.00 refund credited to HDFC Bank Card 9921 from AMAZON on 24-10-26. Available limit: Rs.98,701.00',
  },
  {
    label: 'Infosys Salary NEFT',
    text: 'Dear Customer, your Acct XX1104 has been credited with INR 1,80,000.00 on 30-Oct-26. Info: NEFT-INFOSYS TECH SALARY. Avl Bal Rs.2,15,000.00',
  },
  {
    label: 'OneCard Spend',
    text: 'You spent Rs.1,100.00 on your OneCard ending 5678 at FLIPKART on 24-Oct-2026. Avl Limit: Rs.48,900.00',
  },
  {
    label: 'Netflix E-Mandate Autopay',
    text: 'Rs.649.00 has been debited from A/c XX4321 towards NETFLIX for Autopay (E-Mandate). UMRN: HDFC0000000012345',
  },
  {
    label: 'Bank of Baroda UPI',
    text: 'Dear BOB user, your A/c XX1234 is debited by Rs.450.00 on 24-10-2026 by UPI:429812345701 to ZOMATO.',
  },
  {
    label: 'OTP (Rejected)',
    text: 'OTP is 482913 for txn of INR 1,250.50 at AMAZON on HDFC Bank card ending 4321. Valid till 10:20. Do not share OTP.',
  },
];

export function ParserSandbox() {
  const [inputText, setInputText] = useState(PRESETS[0]?.text ?? '');
  const [copied, setCopied] = useState(false);

  const result: ParsedSimResult = simulateParse(inputText);

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Preset Chips */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>
          Test Indian Bank SMS Templates:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setInputText(p.text)}
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: '11px',
                borderColor: inputText === p.text ? 'var(--accent-emerald)' : 'var(--border-subtle)',
                background: inputText === p.text ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-surface-elevated)',
                color: inputText === p.text ? 'var(--accent-emerald)' : 'var(--text-secondary)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Input Textarea */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={16} color="var(--accent-emerald)" />
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Raw SMS / Notification Input</h3>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{inputText.length} chars</span>
          </div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={7}
            placeholder="Paste any bank SMS or payment notification text here..."
            className="input-text"
            style={{
              resize: 'vertical',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              lineHeight: 1.6,
              background: 'var(--bg-main)',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Evaluates live against regexes & heuristics
            </span>
            <button onClick={() => setInputText('')} className="btn btn-ghost btn-sm" style={{ fontSize: '11px' }}>
              Clear
            </button>
          </div>
        </div>

        {/* Live Parse Results Dossier */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Parser Inspection Report</h3>
            <button onClick={copyJson} className="btn btn-secondary btn-sm" style={{ fontSize: '11px' }}>
              {copied ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>

          {result.isRejected ? (
            <div
              style={{
                padding: '16px',
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                gap: '12px',
              }}
            >
              <ShieldAlert size={20} color="var(--accent-rose)" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, color: 'var(--accent-rose)', fontSize: '13px' }}>
                  Transaction Filtered Out
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {result.rejectionReason}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Safety rule: Non-financial alerts, OTPs, promotional loan teasers, and future scheduled reminders never pollute the budget ledger.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Highlight Card */}
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Extracted Amount
                  </span>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#FFF' }} className="mono">
                    {result.amountPaise ? formatINR(result.amountPaise) : '—'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <span
                    className={`badge ${
                      result.direction === 'debit' ? 'badge-rose' : 'badge-emerald'
                    }`}
                  >
                    {result.direction?.toUpperCase()}
                  </span>
                  <span className="badge badge-indigo">{result.mode}</span>
                </div>
              </div>

              {/* Exclusion & Correctness Flags */}
              {result.isExcluded && (
                <div
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '12px',
                  }}
                >
                  <AlertTriangle size={16} color="var(--accent-amber)" />
                  <div>
                    <strong style={{ color: 'var(--accent-amber)' }}>Auto-Excluded (isExcluded: true):</strong>{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>{result.exclusionNote}</span>
                  </div>
                </div>
              )}

              {result.isRefund && (
                <div
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '12px',
                  }}
                >
                  <Sparkles size={16} color="var(--accent-emerald)" />
                  <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>
                    Refund Netting: Netted against today/cycle spend. Does not count as new income.
                  </span>
                </div>
              )}

              {result.isSalaryCandidate && (
                <div
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '12px',
                  }}
                >
                  <CheckCircle size={16} color="var(--accent-indigo)" />
                  <span style={{ color: '#A5B4FC', fontWeight: 600 }}>
                    Detected Salary Candidate: Estimated payday on the {result.detectedPayday}th of month.
                  </span>
                </div>
              )}

              {/* Key Value Details Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px',
                  fontSize: '12px',
                  marginTop: '4px',
                }}
              >
                <div style={{ padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Merchant</div>
                  <div style={{ fontWeight: 600, color: '#FFF' }}>{result.merchant || '—'}</div>
                </div>
                <div style={{ padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Category</div>
                  <div style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>{result.category}</div>
                </div>
                <div style={{ padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Account Last 4</div>
                  <div style={{ fontWeight: 600, color: '#FFF' }} className="mono">{result.accountLast4 ? `••${result.accountLast4}` : '—'}</div>
                </div>
                <div style={{ padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>UPI Reference</div>
                  <div style={{ fontWeight: 600, color: '#FFF' }} className="mono">{result.upiRef || '—'}</div>
                </div>
              </div>

              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  wordBreak: 'break-all',
                  padding: '6px 10px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                dedupe_hash: {result.dedupeHash}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
