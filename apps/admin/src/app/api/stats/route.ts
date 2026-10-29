import { proxyAdmin } from '@/lib/adminApi';

/** Lets the request wait for a sleeping API to wake (Vercel function time limit). */
export const maxDuration = 60;

export async function GET() {
  return proxyAdmin('stats');
}
