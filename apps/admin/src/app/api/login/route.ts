import { NextResponse } from 'next/server';

import {
  authConfigured,
  createSessionToken,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from '@/lib/session';

const FAILURE_DELAY_MS = 800;
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Wrong-password attempts per client IP. In memory, so per server instance: it stops one
 * instance being hammered; the shared password should still be long and random.
 */
const failures = new Map<string, number[]>();

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function recentFailures(ip: string, now: number): number[] {
  const recent = (failures.get(ip) ?? []).filter((t) => t > now - WINDOW_MS);
  if (recent.length === 0) failures.delete(ip);
  else failures.set(ip, recent);
  return recent;
}

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { title: 'Admin sign-in is not configured', detail: 'Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET.' },
      { status: 503 },
    );
  }

  const ip = clientIp(request);
  const now = Date.now();
  if (recentFailures(ip, now).length >= MAX_FAILURES) {
    return NextResponse.json(
      { title: 'Too many attempts', detail: 'Try again in 15 minutes.' },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!passwordMatches(password)) {
    failures.set(ip, [...recentFailures(ip, now), now]);
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return NextResponse.json({ title: 'Wrong password' }, { status: 401 });
  }
  failures.delete(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
