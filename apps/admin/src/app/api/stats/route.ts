import { NextResponse } from 'next/server';
import { OVERVIEW_STATS, SYSTEM_HEALTH } from '@/lib/mockData';

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:5080';

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/api/v1/admin/stats`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {
    // If backend is offline during local UI development, fallback seamlessly
  }

  return NextResponse.json({
    stats: OVERVIEW_STATS,
    health: SYSTEM_HEALTH,
    timestamp: Date.now(),
  });
}

