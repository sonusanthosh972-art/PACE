import { NextResponse } from 'next/server';
import { INITIAL_TRANSACTIONS } from '@/lib/mockData';

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:5080';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const direction = searchParams.get('direction');
  const category = searchParams.get('category');
  const mode = searchParams.get('mode');

  let list: any[] = [];

  try {
    const res = await fetch(`${API_URL}/api/v1/admin/transactions?limit=100`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.transactions) && data.transactions.length > 0) {
        list = data.transactions;
      }
    }
  } catch {
    // Fallback if backend is offline
  }

  if (list.length === 0) {
    list = [...INITIAL_TRANSACTIONS];
  }

  if (direction) {
    list = list.filter((t) => t.direction === direction);
  }
  if (category) {
    list = list.filter((t) => t.category === category);
  }
  if (mode) {
    list = list.filter((t) => t.mode === mode);
  }

  return NextResponse.json({
    transactions: list,
    total: list.length,
  });
}
