import { NextResponse } from 'next/server';
import { INITIAL_USERS } from '@/lib/mockData';

export async function GET() {
  return NextResponse.json({
    users: INITIAL_USERS,
    total: INITIAL_USERS.length,
  });
}
