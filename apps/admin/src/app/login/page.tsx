'use client';

import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { title?: string; detail?: string } | null;
      setError(body?.detail || body?.title || 'Sign-in failed');
    } catch {
      setError('Could not reach the server');
    }
    setBusy(false);
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Lock size={18} />
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>Paisa Pulse Admin</h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Sign in with the admin password.</p>
        <label htmlFor="password" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="input-text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? (
          <p role="alert" style={{ fontSize: '13px', color: '#F87171' }}>
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={busy || password.length === 0}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
