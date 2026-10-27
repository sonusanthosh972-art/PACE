import { NextResponse } from 'next/server';
import { simulateParse } from '@/lib/parserClient';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = body.text || '';
    const result = simulateParse(text);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
}
