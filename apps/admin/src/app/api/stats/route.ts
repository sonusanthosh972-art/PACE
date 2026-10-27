import { NextResponse } from 'next/server';
import { OVERVIEW_STATS, SYSTEM_HEALTH } from '@/lib/mockData';

export async function GET() {
  return NextResponse.json({
    stats: OVERVIEW_STATS,
    health: SYSTEM_HEALTH,
    timestamp: Date.now(),
  });
}
