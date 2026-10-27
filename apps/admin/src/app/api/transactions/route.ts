import { NextResponse } from 'next/server';
import { INITIAL_TRANSACTIONS } from '@/lib/mockData';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const direction = searchParams.get('direction');
  const category = searchParams.get('category');
  const mode = searchParams.get('mode');

  let list = [...INITIAL_TRANSACTIONS];

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
