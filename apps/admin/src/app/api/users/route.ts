import { NextResponse } from 'next/server';
import { INITIAL_USERS } from '@/lib/mockData';

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:5080';

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/api/v1/admin/users`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {
    // Fallback if backend is offline
  }

  return NextResponse.json({
    users: INITIAL_USERS,
    total: INITIAL_USERS.length,
  });
}

