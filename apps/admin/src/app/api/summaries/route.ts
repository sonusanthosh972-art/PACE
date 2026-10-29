import { proxyAdmin } from '@/lib/adminApi';

/** Lets the request wait for a sleeping API to wake (Vercel function time limit). */
export const maxDuration = 60;

export async function GET(request: Request) {
  const limit = new URL(request.url).searchParams.get('limit') ?? '200';
  return proxyAdmin(`summaries?limit=${encodeURIComponent(limit)}`);
}
