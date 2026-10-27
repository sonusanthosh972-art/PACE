import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { isValidSession, SESSION_COOKIE } from './session';

/** Base URL of apps/api-node. Server-side only: the browser never talks to the API directly. */
export const API_URL = (process.env.API_URL || 'http://localhost:5080').replace(/\/+$/, '');

/**
 * Proxies an admin endpoint of the API, attaching the shared ADMIN_API_KEY.
 * The key lives only in the Next.js server environment (apps/admin/.env.local).
 */
export async function proxyAdmin(path: string): Promise<NextResponse> {
  // Checked here as well as in proxy.ts, so a matcher change can never expose data.
  if (!isValidSession((await cookies()).get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ status: 401, title: 'Sign in required' }, { status: 401 });
  }
  const key = process.env.ADMIN_API_KEY;
  if (!key) {
    return NextResponse.json(
      { status: 500, title: 'ADMIN_API_KEY is not set', detail: 'Add it to apps/admin/.env.local (same value as apps/api-node/.env).' },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(`${API_URL}/api/v1/admin/${path}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'x-admin-key': key },
      signal: AbortSignal.timeout(5000),
    });
    const body: unknown = await res.json().catch(() => null);
    return NextResponse.json(body ?? { status: res.status, title: 'Empty response from API' }, { status: res.status });
  } catch {
    return NextResponse.json(
      { status: 502, title: 'API unreachable', detail: `Could not reach ${API_URL}. Is apps/api-node running?` },
      { status: 502 },
    );
  }
}
